#[macro_export]
macro_rules! debug {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!($($arg)*);
        }
    };
}

/// Clamp, but for f32. f32 has no "Ord" trait.
#[allow(clippy::neg_cmp_op_on_partial_ord)]
pub fn clampf32(mut x: f32, min: f32, max: f32) -> f32 {
    // Due to the way NaNs work, using a simple if-else or even min & max, does result in sub-optimal
    // assembly code. Using a mutable variable in this way with this if-else construction generates
    // good assembly.
    if !(x > min) {
        x = min;
    }
    if !(x < max) {
        x = max;
    }
    x
}

/// Maps the angle to be positive, wraps.
pub fn positive_angle_wrap(a: f32) -> f32 {
    if a < 0.0 {
        a + 2.0 * std::f32::consts::PI
    } else {
        a
    }
}
