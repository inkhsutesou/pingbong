use crate::protocol::UpdateSettings;
use crate::room::MatchTime;
use atomic::{Atomic, Ordering};
use serde::{Serialize, Serializer};
const_assert!(Atomic::<MatchTime>::is_lock_free());
const_assert!(Atomic::<u8>::is_lock_free());
const_assert!(Atomic::<u16>::is_lock_free());

pub struct AtomicRelaxed<T: Copy>(Atomic<T>);

#[derive(Serialize)]
pub struct SharedRoomData {
    name: String,
    /// nr_teams == 0 means that it will automatically decide.
    nr_teams: AtomicRelaxed<u8>,
    nr_balls: AtomicRelaxed<u8>,
    spin_towards_center: AtomicRelaxed<bool>,
    power_ups: AtomicRelaxed<bool>,
    match_time: AtomicRelaxed<MatchTime>,
    player_count: AtomicRelaxed<u16>,
}

impl<T: Copy> AtomicRelaxed<T> {
    fn store(&self, t: T) {
        self.0.store(t, Ordering::Relaxed);
    }

    fn load(&self) -> T {
        self.0.load(Ordering::Relaxed)
    }
}

impl<T: Copy + Serialize> Serialize for AtomicRelaxed<T> {
    fn serialize<S>(&self, serializer: S) -> Result<<S as Serializer>::Ok, <S as Serializer>::Error>
    where
        S: Serializer,
    {
        self.load().serialize(serializer)
    }
}

impl Clone for SharedRoomData {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            nr_teams: AtomicRelaxed(Atomic::new(self.nr_teams.load())),
            nr_balls: AtomicRelaxed(Atomic::new(self.nr_balls.load())),
            spin_towards_center: AtomicRelaxed(Atomic::new(self.spin_towards_center.load())),
            power_ups: AtomicRelaxed(Atomic::new(self.power_ups.load())),
            match_time: AtomicRelaxed(Atomic::new(self.match_time.load())),
            player_count: AtomicRelaxed(Atomic::new(self.player_count.load())),
        }
    }
}

impl SharedRoomData {
    // Relaxed ordering is fine now as there are no multiple threads atm.

    /// Creates new shared room data.
    pub fn new(name: String) -> Self {
        Self {
            name,
            nr_teams: AtomicRelaxed(Atomic::new(0)),
            nr_balls: AtomicRelaxed(Atomic::new(2)),
            spin_towards_center: AtomicRelaxed(Atomic::new(false)),
            power_ups: AtomicRelaxed(Atomic::new(true)),
            match_time: AtomicRelaxed(Atomic::new(MatchTime::Short)),
            player_count: AtomicRelaxed(Atomic::new(0)),
        }
    }

    /// Update the player count.
    #[inline]
    pub fn update_player_count(&self, delta: u16) {
        self.player_count.0.fetch_add(delta, Ordering::Relaxed);
    }

    /// Gets the number of teams.
    #[inline]
    pub fn nr_teams(&self) -> u8 {
        self.nr_teams.load()
    }

    /// Gets the number of balls.
    #[inline]
    pub fn nr_balls(&self) -> u8 {
        self.nr_balls.load()
    }

    /// Gets the number of players.
    #[inline]
    pub fn player_count(&self) -> u16 {
        self.player_count.load()
    }

    /// Calculates the number of sectors for ball throwing.
    #[inline]
    pub fn nr_throw_sectors(&self) -> u32 {
        self.nr_teams() as u32
    }

    /// Gets the team angle.
    pub fn team_angle(&self) -> f32 {
        std::f32::consts::PI * 2.0 / (self.nr_teams() as f32)
    }

    /// Power ups.
    #[inline]
    pub fn power_ups(&self) -> bool {
        self.power_ups.load()
    }

    /// Spin towards center?
    #[inline]
    pub fn spin_towards_center(&self) -> bool {
        self.spin_towards_center.load()
    }

    /// Start the match. Prepare the data here if necessary.
    pub fn start(&self) {
        // Auto team.
        /*if self.nr_teams() == 0 */
        {
            let player_count = self.player_count();
            let nr_teams = if player_count > 4 && player_count % 4 == 0 {
                4
            } else if player_count == 2 || player_count == 4 {
                2
            } else if player_count % 3 == 0 {
                3
            } else {
                5
            };
            self.nr_teams.store(nr_teams);
        }
    }

    /// Match time in seconds.
    pub fn match_time_f32(&self) -> f32 {
        match self.match_time() {
            MatchTime::Short => 2.5 * 60.0,
            MatchTime::Long => 5.0 * 60.0,
        }
    }

    /// Match time.
    pub fn match_time(&self) -> MatchTime {
        self.match_time.load()
    }

    /// Update settings.
    pub fn update_settings(&self, update: UpdateSettings) -> bool {
        // First, verify.
        if update.balls < 1 || update.balls > 8 {
            return false;
        }

        // Now perform the update.
        self.nr_balls.store(update.balls);
        self.power_ups.store(update.power_ups);
        self.match_time.store(update.match_time);
        self.spin_towards_center.store(update.spin_towards_center);

        debug!("Updated settings: {:?}", self.settings());

        true
    }

    /// Settings.
    pub fn settings(&self) -> UpdateSettings {
        UpdateSettings {
            balls: self.nr_balls(),
            power_ups: self.power_ups(),
            match_time: self.match_time(),
            spin_towards_center: self.spin_towards_center(),
        }
    }
}
