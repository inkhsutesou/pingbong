use crate::ball::{Ball, BALL_RADIUS_ANGLE, NO_TEAM};
use crate::player::{ClientId, Player, SeqNr};
use crate::protocol::ClientMoveUpdate;
use crate::room::{CIRCLE_RADIUS, FIELD_HEIGHT, FIELD_WIDTH, TPF, TPS};
use crate::util::positive_angle_wrap;
use crate::vector::Vector;
use smallvec::SmallVec;
use static_assertions::_core::ops::{BitOr, BitOrAssign};
use std::cell::Cell;

pub struct Bot {
    id: ClientId,
    seq_nr: Cell<SeqNr>,
    previous_spin: Cell<f32>,
}

/// Bitvector mask for which balls are handled.
#[derive(Copy, Clone)]
pub struct BallMask(u8);

impl BallMask {
    pub fn new() -> Self {
        Self(0)
    }

    pub fn contains(&self, bit: usize) -> bool {
        self.0 & (1 << bit) > 0
    }
}

impl BitOrAssign for BallMask {
    fn bitor_assign(&mut self, rhs: Self) {
        self.0 |= rhs.0;
    }
}

impl BitOr for BallMask {
    type Output = BallMask;

    fn bitor(self, rhs: Self) -> Self::Output {
        Self(self.0 | rhs.0)
    }
}

pub struct BotTickResult {
    pub ball_mask: BallMask,
    pub move_update: ClientMoveUpdate,
}

impl Bot {
    pub fn new(id: ClientId) -> Self {
        Self {
            id,
            seq_nr: Cell::new(0),
            previous_spin: Cell::new(0.0),
        }
    }

    #[inline]
    pub fn id(&self) -> ClientId {
        self.id
    }

    /// Calculates the next move.
    pub fn calculate_move(
        &self,
        player: &Player,
        balls: &[Ball],
        //team_data: &TeamData,
        ball_mask: BallMask,
    ) -> BotTickResult {
        let seq_nr = self.seq_nr.get();
        self.seq_nr.set(seq_nr + TPF);

        // 1. Calculate where on the circle the balls will end up.
        // 2. Filter those that are outside our range.
        // 3. Find out the set of consecutive balls which will give the most coverage on the paddle.
        //      3.1. Loop through the balls, sorted.
        //      3.2. Check how much balls from current ball pos to current ball pos + player width are covered.
        //      3.3. Store the best position.
        // 4. Find out how to move to there.

        // TODO: fails with heavy curve / slow movement
        let player_start_pos = player.current_pos();
        let center = Vector::new(FIELD_WIDTH / 2.0, FIELD_HEIGHT / 2.0);

        let mut ball_destinations: SmallVec<[(usize, &Ball, f32, f32); 8]> = balls
            .iter()
            .enumerate()
            .filter(|&(index, _)| !ball_mask.contains(index))
            .map(|(index, ball)| {
                let c = ball.characteristics();
                let position_direction = c.pos - center;
                let normalized_position_direction = position_direction.normalized_safe();
                let next_dir = Ball::calculate_direction_modification(
                    normalized_position_direction,
                    c.spin,
                    1.0 / TPS as f32,
                );
                let r = position_direction.len();
                (
                    index,
                    ball,
                    normalized_position_direction,
                    r,
                    next_dir.angle_positive(),
                )
            })
            .filter(|&(_, _, _, r, _)| {
                // Only consider balls that are inside the circle.
                r < CIRCLE_RADIUS + 24.0 /* add a margin */
            })
            .filter(|(_, _, normalized_position_direction, _, _)| {
                // Only consider balls that will land in our segment.
                let projected_on_circle = *normalized_position_direction * CIRCLE_RADIUS;
                let angle = projected_on_circle.angle_positive();
                !(player.min_pos() > angle + BALL_RADIUS_ANGLE
                    || player.max_pos() + player.w_angle() < angle - BALL_RADIUS_ANGLE)
            })
            .map(|(index, ball, _normalized_position_direction, r, angle)| (index, ball, r, angle))
            .collect::<SmallVec<_>>();

        ball_destinations
            .sort_by(|(_, _, _, angle1), (_, _, _, angle2)| angle1.partial_cmp(angle2).unwrap());

        debug!("{} {}", self.id(), ball_destinations.len());

        let mut best = (0.0, player_start_pos, 0);

        for (start_index, &(_, _, _, ball_position)) in ball_destinations.iter().enumerate() {
            let end_position = ball_position + player.w_angle();

            let mut score = 0.0;
            let mut new_ball_mask = 0;
            for &(ball_index, ball, radius, other_ball_position) in
                ball_destinations[start_index..].iter()
            {
                if other_ball_position > positive_angle_wrap(end_position) {
                    debug!("break angle");
                    break;
                }

                let ball_base_score = 0.25 + ball.last_rally() as f32;
                const BASE_WEIGHT: f32 = 4.0;
                const INV_MAX_RADIUS: f32 = 1.0 / CIRCLE_RADIUS;
                score += ball_base_score * BASE_WEIGHT + radius * INV_MAX_RADIUS;
                new_ball_mask |= 1 << ball_index;
            }

            // Check against best
            if score > best.0 {
                best = (score, ball_position, new_ball_mask);
            }
        }

        const MARGIN: f32 = 3.0 / 180.0 * std::f32::consts::PI;
        let action = best.1 - MARGIN - player_start_pos;

        // See player.js.
        const SPIN_ALPHA: f32 = 1.0 / 4.0;
        const SPIN_DECAY: f32 = 0.8;
        self.previous_spin
            .update(|spin| spin * (SPIN_DECAY * SPIN_DECAY * SPIN_DECAY));
        let spin = self.previous_spin.get() * (1.0 - SPIN_ALPHA) + SPIN_ALPHA * action * 2.0;

        BotTickResult {
            ball_mask: BallMask(best.2),
            move_update: ClientMoveUpdate {
                delta: action,
                seq_nr,
                ball_hit: NO_TEAM,
                spin,
            },
        }
    }
}
