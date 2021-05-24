use crate::util::positive_angle_wrap;
use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::ops::{Add, Div, Mul, Sub};
use core_simd::f32x2;

#[derive(Debug, Copy, Clone)]
pub struct Vector(f32x2);

impl Serialize for Vector {
    fn serialize<S>(&self, serializer: S) -> Result<<S as Serializer>::Ok, <S as Serializer>::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("Vector", 2)?;
        state.serialize_field("x", &self.x())?;
        state.serialize_field("y", &self.y())?;
        state.end()
    }
}

impl Vector {
    pub fn new(x: f32, y: f32) -> Self {
        Self(f32x2::from_array([x, y]))
    }

    pub fn zero() -> Self {
        Self::new(0.0, 0.0)
    }

    /// Creates a (direction) vector from an angle.
    pub fn from_angle(angle: f32) -> Self {
        let (dy, dx) = angle.sin_cos();
        Self::new(dx, dy)
    }

    #[inline]
    pub fn x(&self) -> f32 {
        self.0.to_array()[0]
    }

    #[inline]
    pub fn y(&self) -> f32 {
        self.0.to_array()[1]
    }

    /// Calculates the perpendicular of the vector.
    #[inline]
    #[must_use]
    pub fn perp(self) -> Self {
        Self::new(self.y(), -self.x())
    }

    /// Calculates the length of this vector.
    pub fn len(self) -> f32 {
        self.len_sqr().sqrt()
    }

    /// Calculates the squared length of this vector.
    #[inline]
    pub fn len_sqr(self) -> f32 {
        (self.0 * self.0).horizontal_sum()
    }

    /// Calculates the dot product of this vector and another.
    #[inline]
    pub fn dot(self, other: Self) -> f32 {
        (self.0 * other.0).horizontal_sum()
    }

    /// 2D cross product.
    pub fn cross(self, other: Self) -> f32 {
        self.x().mul_add(other.y(), -self.y() * other.x())
    }

    /// Inverse.
    #[inline]
    pub fn inverse(self) -> Self {
        Self(-self.0)
    }

    /// Calculates the normalized version of this vector.
    #[must_use]
    pub fn normalized(self) -> Self {
        self * (1.0 / self.len_sqr().sqrt())
    }

    /// Calculates the normalized version of this vector.
    #[must_use]
    pub fn normalized_safe(self) -> Self {
        let len = self.len_sqr();
        if len > 0.0000001 {
            self * (1.0 / len.sqrt())
        } else {
            self
        }
    }

    /// Calculates the angle
    pub fn angle(&self) -> f32 {
        self.y().atan2(self.x())
    }

    /// Calculates the angle in range [0, 2pi[.
    pub fn angle_positive(&self) -> f32 {
        positive_angle_wrap(self.angle())
    }
}

impl Add<Vector> for Vector {
    type Output = Vector;

    #[inline]
    fn add(self, rhs: Vector) -> Self::Output {
        Vector(self.0 + rhs.0)
    }
}

impl Sub<Vector> for Vector {
    type Output = Vector;

    #[inline]
    fn sub(self, rhs: Vector) -> Self::Output {
        Vector(self.0 - rhs.0)
    }
}

impl Div<f32> for Vector {
    type Output = Vector;

    #[inline]
    fn div(self, rhs: f32) -> Self::Output {
        Vector(self.0 / rhs)
    }
}

impl Mul<f32> for Vector {
    type Output = Vector;

    #[inline]
    fn mul(self, rhs: f32) -> Self::Output {
        Vector(self.0 * rhs)
    }
}
