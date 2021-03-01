use std::ops::{Index, IndexMut};

pub struct CircularBuffer<T: Copy, const N: usize> {
    values: Box<[T; N]>,
    insertion_index: usize,
}

impl<T: Copy, const N: usize> CircularBuffer<T, N> {
    /// Creates a new CircularBuffer with the given capacity.
    pub fn new(fill: T) -> Self {
        // Pre-filled so we can optimize.
        Self {
            values: Box::new([fill; N]),
            insertion_index: 0,
        }
    }
}

impl<T: Copy, const N: usize> CircularBuffer<T, N> {
    /// Pushes a new element.
    pub fn push(&mut self, x: T) {
        self.values[self.insertion_index] = x;
        self.insertion_index += 1;
        if self.insertion_index == N {
            self.insertion_index = 0;
        }
    }

    /// Rewind the buffer.
    pub fn rewind(&mut self, amount: usize) {
        self.insertion_index = (self.insertion_index + N - amount) % N;
    }

    /// Gets the last element.
    pub fn last(&self) -> &T {
        &self[N - 1]
    }

    /// Gets the last element (mutable).
    pub fn last_mut(&mut self) -> &mut T {
        &mut self[N - 1]
    }
}

impl<T: Copy, const N: usize> Index<usize> for CircularBuffer<T, N> {
    type Output = T;

    fn index(&self, index: usize) -> &Self::Output {
        &self.values[(index + self.insertion_index) % N]
    }
}

impl<T: Copy, const N: usize> IndexMut<usize> for CircularBuffer<T, N> {
    fn index_mut(&mut self, index: usize) -> &mut Self::Output {
        &mut self.values[(index + self.insertion_index) % N]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_without_wrap_around() {
        let mut b = CircularBuffer::<i32, 4>::new(0);
        b.push(1);
        b.push(2);
        b.push(3);
        assert_eq!(b[0], 0);
        assert_eq!(b[1], 1);
        assert_eq!(b[2], 2);
        b.push(4);
        assert_eq!(b[0], 1);
        assert_eq!(b[1], 2);
        assert_eq!(b[2], 3);
        assert_eq!(b[3], 4);
        assert_eq!(*b.last(), 4);
    }

    #[test]
    fn push_wraps_around() {
        let mut b = CircularBuffer::<i32, 4>::new(0);
        b.push(1);
        b.push(2);
        b.push(3);
        b.push(4);
        assert_eq!(b[0], 1);
        assert_eq!(b[1], 2);
        assert_eq!(b[2], 3);
        assert_eq!(b[3], 4);
        b.push(5);
        assert_eq!(b[3], 5);
        assert_eq!(*b.last(), 5);
        b.push(6);
        assert_eq!(b[3], 6);
        assert_eq!(*b.last(), 6);
    }

    #[test]
    fn push_wraps_bigger_capacity_test_multiple_pushes() {
        let mut b = CircularBuffer::<i64, 4>::new(0);
        b.push(1);
        b.push(2);
        b.push(3);
        b.push(4);
        assert_eq!(b[0], 1);
        assert_eq!(b[1], 2);
        assert_eq!(b[2], 3);
        assert_eq!(b[3], 4);
        assert_eq!(*b.last(), 4);

        for i in 5..20 {
            b.push(i);
            assert_eq!(b[0], 1 - 5 + i + 1);
            assert_eq!(b[1], 2 - 5 + i + 1);
            assert_eq!(b[2], 3 - 5 + i + 1);
            assert_eq!(b[3], 4 - 5 + i + 1);
            assert_eq!(*b.last(), 4 - 5 + i + 1);
        }
    }
}
