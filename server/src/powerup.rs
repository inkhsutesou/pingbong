use crate::ball::BALL_RADIUS;
use crate::vector::Vector;
use serde::Serialize;

/// A line segment has no width, so we need to extend the powerup size with the ball radius as padding.
const POWERUP_PADDING: f32 = BALL_RADIUS;
/// Radius of powerup circle.
pub const POWERUP_SIZE: f32 = 16.0 + POWERUP_PADDING;

#[derive(Debug, Copy, Clone, Serialize)]
pub enum PowerUpEffectType {
    GrowOwnTeam,
    BonusPoints,
    SplitRGB,
    RotateField,
    SlowDown,
}

#[derive(Debug, Copy, Clone)]
pub struct PowerUpEffect {
    pub effect_type: PowerUpEffectType,
    pub activating_team: u8,
}

#[derive(Debug, Serialize, Copy, Clone)]
pub struct PowerUp {
    pos: Vector,
    effect: PowerUpEffectType,
}

impl PowerUp {
    /// Creates a new power-up.
    pub fn new(pos: Vector, effect: PowerUpEffectType) -> Self {
        Self { pos, effect }
    }

    /// Power-up effect.
    #[inline]
    pub fn effect_type(&self) -> PowerUpEffectType {
        self.effect
    }

    /// Circle to line segment collision detection.
    pub fn collides(&self, p1: Vector, p2: Vector) -> bool {
        let d = p2 - p1;
        let f = p1 - self.pos;
        let a = d.dot(d);
        let b = 2.0 * f.dot(d);
        let c = f.dot(f) - POWERUP_SIZE * POWERUP_SIZE;
        let discriminant = b * b - 4.0 * a * c;
        if discriminant >= 0.0 {
            let discriminant = discriminant.sqrt();
            let a = 2.0 * a;
            let t1 = -b - discriminant;
            let t2 = -b + discriminant;
            (t1 >= 0.0 && t1 <= a) || (t2 >= 0.0 && t2 <= a)
        } else {
            false
        }
    }
}
