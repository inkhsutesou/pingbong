use crate::powerup::PowerUpEffectType;
use crate::room::{CIRCLE_RADIUS, FIELD_HEIGHT, FIELD_WIDTH};
use crate::vector::Vector;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

pub struct Tracker {
    /// Specifies which sector (mod TEAMS(=SECTORS)) the next ball is thrown at.
    /// This is for fairness.
    next_ball_thrown: u32,
    /// Random number generation for stuff like power up locations.
    rng: SmallRng,
}

impl Tracker {
    /// Creates a new LocationTracker.
    pub fn new(seed: u64) -> Self {
        Self {
            next_ball_thrown: 0,
            rng: SmallRng::seed_from_u64(seed),
        }
    }

    /// Resets the tracker.
    pub fn reset(&mut self) {
        self.next_ball_thrown = 0;
        // No need to reset rng, because it'll just continue on with new numbers.
    }

    /// Returns the next powerup location.
    pub fn next_powerup_location(&mut self) -> Vector {
        let rand = self.rng.gen_range(0.0..2.0 * std::f32::consts::PI);
        let (si, co) = rand.sin_cos();
        let rand = self.rng.gen_range(50.0..CIRCLE_RADIUS - 50.0);
        Vector::new(
            co * rand + FIELD_WIDTH / 2.0,
            si * rand + FIELD_HEIGHT / 2.0,
        )
    }

    /// Returns the next powerup type.
    pub fn next_powerup_type(&mut self) -> PowerUpEffectType {
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
    pub fn next_ball_characteristics(&mut self, nr_sectors: u32) -> (Vector, f32) {
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
