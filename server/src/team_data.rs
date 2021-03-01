// Delta verification, same as in the client.
// Have to get the exact same value as JS.
const MAX_MOVE: f32 = 0.157_079_64 * 2.0;

pub const SLOWDOWN_FACTOR: f32 = 1.0 / 8.0;

#[derive(Debug, Copy, Clone)]
pub struct TeamData {
    max_move_factor: f32,
}

impl TeamData {
    #[inline]
    pub fn max_move_factor(&self) -> f32 {
        self.max_move_factor
    }

    #[inline]
    pub fn set_speed(&mut self, factor: f32) {
        self.max_move_factor = MAX_MOVE * factor;
    }
}

impl Default for TeamData {
    fn default() -> Self {
        Self {
            max_move_factor: MAX_MOVE,
        }
    }
}
