use crate::ball::{Ball, BallTickResult, RoomDataForBall, BALL_RADIUS, MOVEMENT_BUFFER_CAP};
use crate::player::{Client, ClientId, Player, SeqNr};
use crate::powerup::{PowerUp, PowerUpEffect, PowerUpEffectType};
use crate::protocol::{
    BallSync, Join, JoinData, JoinedRoom, Leave, MessageToClient, MessageToInbox,
    PlayerAlreadyJoinedData, PowerUpPacket, RebalanceTeam, Start, StartState, SyncMessage,
    UpdateSettings,
};
use crate::room_manager::RoomId;
use crate::rooms;
use crate::team_data::{TeamData, SLOWDOWN_FACTOR};
use crate::vector::Vector;
use atomic::Atomic;
use bytes::Bytes;
use futures::channel::mpsc::UnboundedReceiver;
use futures::StreamExt;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize, Serializer};
use smallvec::SmallVec;
use std::collections::BTreeMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{self, Instant, Interval};

pub const TPS: u8 = 20;
pub const TPF: u32 = 60 / (TPS as u32);
pub const FIELD_WIDTH: f32 = 800.0;
pub const FIELD_HEIGHT: f32 = 800.0;
pub const CIRCLE_RADIUS: f32 = 300.0;

pub const MAX_TEAMS: usize = 5;

/// Resize factor when taking the resize boost?
pub const POWER_UP_RESIZE_FACTOR: f32 = 1.75;

/// How long is the countdown for the match start?
const TIME_WAIT_BEFORE_START: f32 = 3.0;

/// How long is the countdown for the match end to return to the room wait screen.
const TIME_WAIT_BEFORE_RESET: f32 = 5.0;

const TICK_TIME: Duration = Duration::from_millis(1000 / TPS as u64);

/// Power up state for room.
#[derive(Copy, Clone)]
enum PowerUpState {
    DoNothing,
    WaitUntilSpawn(f32),
    Spawned(PowerUp),
    WaitUntilItIsOver(f32, PowerUpEffect),
}

impl PowerUpState {
    const fn default_spawn_wait_state() -> Self {
        Self::WaitUntilSpawn(15.0)
    }

    const fn wait_until_over_state(power_up_effect: PowerUpEffect) -> Self {
        Self::WaitUntilItIsOver(10.0, power_up_effect)
    }
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone)]
#[repr(u8)]
pub enum MatchTime {
    Short,
    Long,
}

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

struct Tracker {
    /// Specifies which sector (mod TEAMS(=SECTORS)) the next ball is thrown at.
    /// This is for fairness.
    next_ball_thrown: u32,
    /// Random number generation for stuff like power up locations.
    rng: SmallRng,
}

impl Tracker {
    /// Creates a new LocationTracker.
    fn new(seed: u64) -> Self {
        Self {
            next_ball_thrown: 0,
            rng: SmallRng::seed_from_u64(seed),
        }
    }

    /// Resets the tracker.
    fn reset(&mut self) {
        self.next_ball_thrown = 0;
        // No need to reset rng, because it'll just continue on with new numbers.
    }

    /// Returns the next powerup location.
    fn next_powerup_location(&mut self) -> Vector {
        let rand = self.rng.gen_range(0.0..2.0 * std::f32::consts::PI);
        let (si, co) = rand.sin_cos();
        let rand = self.rng.gen_range(50.0..CIRCLE_RADIUS - 50.0);
        Vector::new(
            co * rand + FIELD_WIDTH / 2.0,
            si * rand + FIELD_HEIGHT / 2.0,
        )
    }

    /// Returns the next powerup type.
    fn next_powerup_type(&mut self) -> PowerUpEffectType {
        match self.rng.gen_range(0..=4) {
            0 => PowerUpEffectType::GrowOwnTeam,
            1 => PowerUpEffectType::BonusPoints,
            2 => PowerUpEffectType::SplitRGB,
            3 => PowerUpEffectType::RotateField,
            4 => PowerUpEffectType::SlowDown,
            // Should never happen, but I don't want to pollute the machine code with error handling that will never get executed.
            _ => PowerUpEffectType::GrowOwnTeam,
        }
    }

    /// Returns the next ball characteristics.
    fn next_ball_characteristics(&mut self, nr_sectors: u32) -> (Vector, f32) {
        // Determine which circle sector the ball will be thrown in.
        let sector = self.next_ball_thrown;
        self.next_ball_thrown = self.next_ball_thrown.wrapping_add(1);
        (
            Vector::new(FIELD_WIDTH / 2.0, FIELD_HEIGHT / 2.0),
            self.sector_to_angle(sector, nr_sectors),
        )
    }

    /// Converts a sector number (mod TEAMS(=SECTORS)) to an angle.
    #[inline]
    fn sector_to_angle(&self, sector: u32, nr_sectors: u32) -> f32 {
        (sector as f32 + 0.5) / (nr_sectors as f32) * (2.0 * std::f32::consts::PI)
    }
}

pub struct Room {
    id: RoomId,
    players: BTreeMap<ClientId, Player>,
    team_data: [TeamData; MAX_TEAMS as usize],
    balls: Vec<Ball>,
    power_up_state: PowerUpState,
    host_client_id: ClientId,
    next_client_id: ClientId,
    is_started: bool,
    tick_delay: Interval,
    timer: Instant,
    frame_timer: SeqNr,
    /// Yeah we have to do this because the actual time can drift from the buffer shifts.
    last_tick_time: Instant,
    seconds_passed_since_start: f32,
    shared_data: Arc<SharedRoomData>,
    tracker: Tracker,
}

impl Room {
    /// Creates a new room.
    pub fn new(id: RoomId, shared_data: Arc<SharedRoomData>) -> Self {
        let now = Instant::now();
        Self {
            id,
            players: Default::default(),
            team_data: [Default::default(); MAX_TEAMS as usize],
            balls: Vec::new(),
            power_up_state: PowerUpState::DoNothing,
            host_client_id: 0,
            next_client_id: 0,
            is_started: false,
            tick_delay: time::interval(TICK_TIME),
            timer: now,
            frame_timer: 0,
            last_tick_time: now,
            seconds_passed_since_start: 0.0,
            shared_data,
            tracker: Tracker::new(id),
        }
    }

    /// Resets the room state.
    fn reset(&mut self) {
        self.is_started = false;
        self.balls.clear();
        self.tracker.reset();
        self.seconds_passed_since_start = 0.0;
    }

    /// Calculates the teams populations.
    fn team_population(&self) -> [u8; MAX_TEAMS] {
        let mut counts = [0u8; MAX_TEAMS];

        for p in self.players.values() {
            counts[p.team_nr() as usize] += 1;
        }

        counts
    }

    /// Gets the least populated team.
    pub fn least_populated_team(&self) -> u8 {
        let teams = self.shared_data.nr_teams();
        let counts = self.team_population();
        counts[0..teams as usize]
            .iter()
            .enumerate()
            .min_by_key(|(_, c)| *c)
            .map(|(i, _)| i)
            .unwrap_or(0) as u8
    }

    /// Gets the player count.
    pub fn player_count(&self) -> usize {
        self.players.len()
    }

    /// Broadcasts a message to all clients.
    pub async fn broadcast(&mut self, msg: MessageToClient<'_>) {
        let bytes: Bytes = crate::bincode::serialize(&msg).expect("encode").into();
        for p in self.players.values_mut() {
            p.client_mut().send_bytes(bytes.clone()).await;
        }
    }

    /// Broadcasts a message to all clients except one.
    pub async fn broadcast_except(&mut self, msg: MessageToClient<'_>, except: ClientId) {
        let bytes: Bytes = crate::bincode::serialize(&msg).expect("encode").into();
        for (_, p) in self.players.iter_mut().filter(|(&id, _)| id != except) {
            p.client_mut().send_bytes(bytes.clone()).await;
        }
    }

    /// Adds a player.
    pub fn add_player(&mut self, id: ClientId, player: Player) {
        self.players.insert(id, player);
        self.shared_data.update_player_count(1);
    }

    /// Start the room.
    pub async fn start(&mut self) {
        //let auto_team = self.shared_data.nr_teams() == 0;

        // Auto change settings if necessary.
        self.shared_data.start();
        let nr_teams = self.shared_data.nr_teams();

        // Power up start state.
        self.power_up_state = if self.shared_data.power_ups() {
            PowerUpState::default_spawn_wait_state()
        } else {
            PowerUpState::DoNothing
        };

        // Put players in teams if necessary.
        /*if auto_team */
        {
            let mut next = 0;
            for p in self.players.values_mut() {
                p.set_team_nr(next);
                next += 1;
                if next >= nr_teams {
                    next = 0;
                }
            }
        }

        // Setup players.
        let nr_teams = nr_teams as u32;
        let team_population = self.team_population();
        let mut current_team_distribution = [0u8; MAX_TEAMS];
        let team_angle = self.shared_data.team_angle();
        for p in self.players.values_mut() {
            p.reset();
            let team_nr = p.team_nr() as usize;
            let player_nr_in_team = current_team_distribution[team_nr];
            let max_in_team = team_population[team_nr];
            p.setup(team_angle, nr_teams, max_in_team, player_nr_in_team);
            current_team_distribution[team_nr] += 1;
        }

        let n_balls = self.shared_data.nr_balls() as u32;
        let mut balls = Vec::with_capacity(n_balls as usize);
        if n_balls == 1 {
            let (pos, angle) = self
                .tracker
                .next_ball_characteristics(self.shared_data.nr_throw_sectors());
            balls.push(Ball::new(pos, angle));
        } else {
            let n_balls_f = n_balls as f32;
            let angle = std::f32::consts::PI * 2.0 / n_balls_f;
            let r = {
                let s = (angle * 0.5).sin();
                BALL_RADIUS / s
            };
            for i in 0..n_balls {
                let (pos, dxdy_angle) = self
                    .tracker
                    .next_ball_characteristics(self.shared_data.nr_throw_sectors());
                let off_angle = angle * (i as f32);
                balls.push(Ball::new(
                    Vector::from_angle(off_angle) * r + pos,
                    dxdy_angle,
                ));
            }
        }

        let start_states = self
            .players
            .iter()
            .map(|(&client_id, p)| StartState {
                client_id,
                team_nr: p.team_nr(),
                pos: p.current_pos(),
                w_angle: p.w_angle(),
            })
            .collect::<Vec<_>>();

        self.broadcast(MessageToClient::Start(&Start {
            team_count: self.shared_data.nr_teams(),
            spin_towards_center: self.shared_data.spin_towards_center(),
            match_time: self.shared_data.match_time_f32(),
            states: start_states.as_slice(),
            balls: balls
                .iter()
                .map(|b| b.characteristics())
                .collect::<Vec<_>>()
                .as_slice(),
        }))
        .await;

        self.balls = balls;

        // Actually start signal.
        // We reset the delay signal to sync up.
        self.reset_delay();
        self.timer = Instant::now();
        self.last_tick_time = self.timer;
        self.is_started = true;
    }

    /// Resizes team members with fairness * extra resizing factor.
    fn resize_team_members(
        &mut self,
        team_nr: u8,
        resize_extra_factor: f32,
    ) -> Option<RebalanceTeam> {
        let team_angle = self.shared_data.team_angle();

        let max_in_team = self
            .players
            .values()
            .filter(|p| p.team_nr() == team_nr)
            .count() as u8;

        let mut data = None;
        if max_in_team > 0 {
            for player in self.players.values_mut().filter(|p| p.team_nr() == team_nr) {
                player.reset_setup_for_fairness(
                    team_angle,
                    self.shared_data.nr_teams() as u32,
                    max_in_team,
                    resize_extra_factor,
                );
                if data.is_none() {
                    data = Some(RebalanceTeam {
                        min_pos: player.min_pos(),
                        max_pos: player.max_pos(),
                        w_angle: player.w_angle(),
                    });
                }
            }
        }

        data
    }

    /// Rebalances a team (e.g. due to a player leaving).
    fn rebalance_team(&mut self, team_nr: u8) -> Option<RebalanceTeam> {
        self.resize_team_members(team_nr, 1.0)
    }

    /// Removes a player.
    pub async fn remove_player(&mut self, client_id: ClientId) -> Client {
        let player = self
            .players
            .remove(&client_id)
            .expect("client should not be removed already");
        self.shared_data.update_player_count(u16::MAX);
        if self.host_client_id == client_id {
            let mut rooms = rooms().lock().await;
            rooms.owner_leave(player.client().ip());
            // Handle host migration (only if there are still players).
            if let Some((&id, player)) = self.players.first_key_value() {
                self.host_client_id = id;
                let _ = rooms.increase_count(player.client().ip(), true);
            }
        }
        let rebalance = &if self.is_started {
            self.rebalance_team(player.team_nr())
        } else {
            None
        };
        self.broadcast(MessageToClient::Leave(Leave {
            left_client_id: client_id,
            new_host_id: self.host_client_id,
            rebalance,
        }))
        .await;
        player.into_client()
    }

    /// Reset the tick delay.
    fn reset_delay(&mut self) {
        self.tick_delay = time::interval(TICK_TIME);
    }

    /// Late collision with ball.
    async fn collide(&mut self, player_id: ClientId, ball_id: usize) -> bool {
        let player = match self.players.get(&player_id) {
            Some(p) => p,
            None => return false,
        };

        let frame_time = self.frame_timer;

        debug!("{} {}", frame_time, player.move_seq_nr());

        let offset = match frame_time.checked_sub(player.move_seq_nr() + (TPF - 1)) {
            Some(offset) => offset / TPF,
            None => {
                debug!("Offset rejected because subtraction overflow");
                return false;
            }
        };

        if offset >= MOVEMENT_BUFFER_CAP as u32 {
            debug!("Offset rejected because outside of history range");
            return false;
        }

        let index = (MOVEMENT_BUFFER_CAP - 1) - (offset as usize);
        debug!("collide index {}, offset {}", index, offset);
        let ball = &mut self.balls[ball_id];

        let room_data_for_ball = RoomDataForBall {
            delta: TPF as f32,
            team_count: self.shared_data.nr_teams().into(),
            power_up: None,
            spin_towards_center: self.shared_data.spin_towards_center(),
        };

        for i in (index.saturating_sub(1)..=index).rev() {
            if ball.has_collision(i) {
                debug!("Early escape because collision already ACK'd");
                break;
            }

            if let (BallTickResult::Bounce, _, rewritten_history) = ball.tick_no_update(
                room_data_for_ball,
                self.players.values().filter(&|&p| std::ptr::eq(p, player)),
                i,
            ) {
                ball.rewind_and_apply(offset as _, rewritten_history);

                for _ in index..(MOVEMENT_BUFFER_CAP - 1) {
                    ball.tick(
                        room_data_for_ball,
                        self.players.values().filter(&|_| true),
                        MOVEMENT_BUFFER_CAP - 1,
                    );
                }

                return true;
            }
        }

        // DEBUG
        for i in 0..MOVEMENT_BUFFER_CAP {
            debug!(
                "  test {} {:?}",
                i,
                ball.tick_no_update(
                    room_data_for_ball,
                    self.players.values().filter(&|&p| std::ptr::eq(p, player)),
                    i,
                )
                .0
            );
        }

        false
    }

    /// Gets the current (floating point) frame number.
    fn frame_nr(&self) -> f32 {
        self.timer.elapsed().as_secs_f32() * 60.0
    }

    /// Handle end of match.
    /// Separate method because of code size reasons.
    #[cold]
    async fn end_match(&mut self) {
        debug!("end of match");
        self.reset();
        self.broadcast(MessageToClient::ResetRoom).await;
        rooms().lock().await.unmark_as_playing(self.id);
    }

    /// Gets the room id.
    #[inline]
    pub fn id(&self) -> RoomId {
        self.id
    }

    /// Handle power up effect.
    fn handle_power_up(&mut self, power_up_effect: PowerUpEffect) -> PowerUpPacket {
        self.power_up_state = PowerUpState::wait_until_over_state(power_up_effect);
        debug!("Handle power-up effect: {:?}", power_up_effect);

        match power_up_effect.effect_type {
            PowerUpEffectType::GrowOwnTeam => {
                if let Some(rebalance_data) = self
                    .resize_team_members(power_up_effect.activating_team, POWER_UP_RESIZE_FACTOR)
                {
                    PowerUpPacket::ResizePlayers(power_up_effect.activating_team, rebalance_data)
                } else {
                    PowerUpPacket::None
                }
            }
            PowerUpEffectType::BonusPoints => {
                PowerUpPacket::BonusPoints(power_up_effect.activating_team)
            }
            PowerUpEffectType::SplitRGB => PowerUpPacket::SplitRGB(power_up_effect.activating_team),
            PowerUpEffectType::RotateField => {
                PowerUpPacket::RotateField(power_up_effect.activating_team)
            }
            PowerUpEffectType::SlowDown => {
                for (_, td) in self
                    .team_data
                    .iter_mut()
                    .enumerate()
                    .filter(|(i, _)| *i != power_up_effect.activating_team as usize)
                {
                    td.set_speed(SLOWDOWN_FACTOR);
                }
                PowerUpPacket::SlowDown(power_up_effect.activating_team, SLOWDOWN_FACTOR)
            }
        }
    }

    /// Power up state machine handling.
    fn power_up_state_machine(&mut self, delta: f32) -> PowerUpPacket {
        let (new_state, packet) = match self.power_up_state {
            PowerUpState::WaitUntilSpawn(time) => {
                let time = time - delta;
                if time <= 0.0 {
                    let pos = self.tracker.next_powerup_location();
                    let power_up_type = self.tracker.next_powerup_type();
                    debug!("Spawn power up {:?} at {:?}", power_up_type, pos);
                    let power_up = PowerUp::new(pos, power_up_type);
                    (
                        PowerUpState::Spawned(power_up),
                        PowerUpPacket::SpawnPowerUp(power_up),
                    )
                } else {
                    (PowerUpState::WaitUntilSpawn(time), PowerUpPacket::None)
                }
            }
            PowerUpState::WaitUntilItIsOver(
                time,
                PowerUpEffect {
                    effect_type,
                    activating_team,
                },
            ) => {
                let time = time - delta;
                if time <= 0.0 {
                    let packet = match effect_type {
                        PowerUpEffectType::GrowOwnTeam => self
                            .rebalance_team(activating_team)
                            .map(|data| PowerUpPacket::ResizePlayers(activating_team, data))
                            .unwrap_or(PowerUpPacket::None),
                        PowerUpEffectType::BonusPoints => PowerUpPacket::None,
                        PowerUpEffectType::SplitRGB => PowerUpPacket::SplitRGB(activating_team),
                        PowerUpEffectType::RotateField => {
                            PowerUpPacket::RotateField(activating_team)
                        }
                        PowerUpEffectType::SlowDown => {
                            for (_, td) in self
                                .team_data
                                .iter_mut()
                                .enumerate()
                                .filter(|(i, _)| *i != activating_team as usize)
                            {
                                td.set_speed(1.0);
                            }
                            PowerUpPacket::SlowDown(activating_team, 1.0)
                        }
                    };
                    (PowerUpState::default_spawn_wait_state(), packet)
                } else {
                    (
                        PowerUpState::WaitUntilItIsOver(
                            time,
                            PowerUpEffect {
                                effect_type,
                                activating_team,
                            },
                        ),
                        PowerUpPacket::None,
                    )
                }
            }
            otherwise => (otherwise, PowerUpPacket::None),
        };
        self.power_up_state = new_state;
        packet
    }

    /// Room tick function.
    pub async fn tick(&mut self, deadline: Instant) {
        let delta = {
            // This check is okay, because the subtraction checks anyway...
            if deadline < self.last_tick_time {
                0.0
            } else {
                let delta = (deadline - self.last_tick_time).as_secs_f32();
                self.last_tick_time = deadline;
                delta
            }
        };

        if !self.is_started {
            return;
        }

        self.seconds_passed_since_start += delta;

        let frame_nr = self.frame_nr();

        let mut late_collision = SmallVec::<[(ClientId, u8); 4]>::new();
        let mut client_syncs = Vec::new();
        let mut ball_syncs = SmallVec::new();
        for (&id, player) in self.players.iter_mut() {
            if let Some(sync) = player.tick(id) {
                client_syncs.push(sync);
            }
            if let Some(ball_hit) = player.ball_hit() {
                late_collision.push((id, ball_hit.id()));
            }
        }

        for &(player_id, ball_id) in late_collision.iter() {
            let ball_id_u = ball_id as usize;
            if self.collide(player_id, ball_id_u).await {
                // Yes, something did happen in the past we didn't see!
                let ball = &self.balls[ball_id_u];
                ball_syncs.push(BallSync::new(ball_id, 1, &ball));
                debug!("queued a correction");
            }
        }

        for player in self.players.values_mut() {
            player.reset_ball_hit();
        }

        let mut power_up_packet = PowerUpPacket::None;
        if self.seconds_passed_since_start >= TIME_WAIT_BEFORE_START {
            let end_time = TIME_WAIT_BEFORE_START + self.shared_data.match_time_f32();

            if self.seconds_passed_since_start < end_time {
                power_up_packet = self.power_up_state_machine(delta);

                // Need to read power up from current state.
                let power_up = match self.power_up_state {
                    PowerUpState::Spawned(p) => Some(p),
                    _ => None,
                };

                // Convert to "tick time".
                let delta = delta * 60.0;

                let room_data_for_ball = RoomDataForBall {
                    delta,
                    team_count: self.shared_data.nr_teams().into(),
                    power_up,
                    spin_towards_center: self.shared_data.spin_towards_center(),
                };

                // Game play loop.
                for i in 0..self.balls.len() {
                    let ball = &mut self.balls[i];
                    let (result, power_up_effect) = ball.tick(
                        room_data_for_ball,
                        self.players.values().filter(&|_| true),
                        MOVEMENT_BUFFER_CAP - 1,
                    );
                    match result {
                        BallTickResult::Outside => {
                            //debug!("outside {}", ball.last_hit_team());
                            ball.reset_characteristics(
                                self.tracker
                                    .next_ball_characteristics(self.shared_data.nr_throw_sectors()),
                            );
                            ball_syncs.push(BallSync::new(i as _, 2, ball));
                            ball.reset_other_fields_for_respawn();
                        }
                        BallTickResult::Bounce => {
                            debug!("Bounce {}", i);
                            ball_syncs.push(BallSync::new(i as _, 1, ball));
                        }
                        _ => {
                            ball_syncs.push(BallSync::new(i as _, 0, ball));
                        }
                    }

                    if let Some(power_up_effect) = power_up_effect {
                        power_up_packet = self.handle_power_up(power_up_effect);
                    }
                }
            } else if self.seconds_passed_since_start > end_time + TIME_WAIT_BEFORE_RESET {
                self.end_match().await;
            }
        }

        // Just send everything to aggressively sync.
        //if !client_syncs.is_empty()
        //    || !ball_syncs.is_empty()
        //    || !matches!(power_up_packet, PowerUpPacket::None)
        {
            //debug!("power up packet: {:?}", power_up_packet);
            let sync = SyncMessage {
                frame_nr,
                client_syncs,
                ball_syncs,
                power_up: power_up_packet,
            };

            self.broadcast(MessageToClient::Sync(&sync)).await;
        }

        self.frame_timer += TPF;
    }

    /// Inbox process.
    async fn inbox_process(&mut self, msg: MessageToInbox) -> bool {
        match msg {
            MessageToInbox::RemovePlayer(sender, id) => {
                sender
                    .send(self.remove_player(id).await)
                    .expect("send client");

                if self.player_count() == 0 {
                    rooms().lock().await.remove(self.id());
                    return false;
                }
            }

            MessageToInbox::Start(sender) => {
                debug!(
                    "start from {} ({} {} {})",
                    sender,
                    self.is_started,
                    self.host_client_id,
                    self.player_count()
                );
                if !self.is_started && sender == self.host_client_id && self.player_count() > 1 {
                    rooms().lock().await.mark_as_playing(self.id());
                    self.start().await;
                }
            }

            MessageToInbox::UpdateSettings(sender, s) => {
                if !self.is_started
                    && sender == self.host_client_id
                    && self.shared_data.update_settings(s)
                {
                    self.broadcast_except(MessageToClient::UpdateSettings(s), sender)
                        .await;
                }
            }

            MessageToInbox::MovePlayer(id, msg) => {
                if self.is_started {
                    if let Some(player) = self.players.get_mut(&id) {
                        player.queue_move(msg, &self.team_data[player.team_nr() as usize]);
                    }
                }
            }

            MessageToInbox::JoinPlayer(join_tx, mut client, name) => {
                debug_assert!(!self.is_started);

                // Update and create data.
                let id = self.next_client_id;
                self.next_client_id += 1;

                // If the player is not the creator of the room.
                if id > 0 {
                    let already_joined = self
                        .players
                        .iter()
                        .map(|(&id, player)| PlayerAlreadyJoinedData {
                            spawn_msg: Join {
                                client_id: id,
                                name: player.name(),
                            },
                        })
                        .collect::<Vec<_>>();

                    client
                        .send(&MessageToClient::JoinedRoom(JoinedRoom {
                            client_id: id,
                            host_id: self.host_client_id,
                            already_joined: already_joined.as_slice(),
                            settings: self.shared_data.settings(),
                        }))
                        .await;
                }

                let player = Player::new(client, name, self.least_populated_team());

                self.broadcast_except(
                    MessageToClient::Join(Join {
                        client_id: id,
                        name: player.name(),
                    }),
                    id,
                )
                .await;

                self.add_player(id, player);

                join_tx.send(JoinData { id }).expect("join data");
            }
        }

        true
    }
}

/// Room async loop.
pub async fn room_loop(
    mut inbox_rx: UnboundedReceiver<MessageToInbox>,
    id: RoomId,
    shared_data: Arc<SharedRoomData>,
) {
    let mut room = Room::new(id, shared_data);

    // We don't need to wait for the first message, because this loop will only exit if
    // `inbox_process` becomes false.
    loop {
        tokio::select! {
            deadline = room.tick_delay.tick() => {
                //let now = std::time::Instant::now();
                room.tick(deadline).await;
                //println!("{:?}", std::time::Instant::now()-now);
            }

            Some(msg) = inbox_rx.next() => {
                if !room.inbox_process(msg).await {
                    break;
                }
            }
        }
    }
}
