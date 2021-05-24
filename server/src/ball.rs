use crate::circular_buffer::CircularBuffer;
use crate::player::{ClientId, Player};
use crate::powerup::{PowerUp, PowerUpEffect};
use crate::protocol::BallData;
use crate::room::{CIRCLE_RADIUS, FIELD_HEIGHT, FIELD_WIDTH};
use crate::util::clampf32;
use crate::vector::Vector;
use serde::Serialize;
use std::cell::RefCell;
use std::collections::hash_map::Values;
use std::iter::Filter;

pub const MOVEMENT_BUFFER_CAP: usize = 6;
pub const DEFAULT_BALL_SPEED: f32 = 4.0;
pub const BALL_RADIUS: f32 = 8.0;
pub const BALL_RADIUS_ANGLE: f32 = 0.031_989_083; //(BALL_RADIUS / CIRCLE_RADIUS).atan();
pub const SPIN_MAX: f32 = 0.05;
pub const NO_TEAM: u8 = 0b1111;
const MAX_RALLIES: u8 = 5;

type PlayerIter<'a, 'b> =
    Filter<Values<'a, ClientId, RefCell<Player>>, &'b dyn Fn(&&RefCell<Player>) -> bool>;

#[derive(Copy, Clone)]
pub struct RoomDataForBall {
    pub delta: f32,
    pub team_count: u32,
    pub power_up: Option<PowerUp>,
    pub spin_towards_center: bool,
}

#[derive(Serialize, Copy, Clone)]
pub struct HitPair(u8);

impl HitPair {
    #[inline]
    pub const fn new(hit_team: u8, receiving_team: u8) -> Self {
        Self((hit_team << 4) | receiving_team)
    }

    #[inline]
    pub const fn none() -> Self {
        Self::new(NO_TEAM, NO_TEAM)
    }

    #[inline]
    pub fn hit_team(&self) -> u8 {
        self.0 >> 4
    }

    #[inline]
    pub fn receiving_team(&self) -> u8 {
        self.0 & 15
    }
}

#[derive(Copy, Clone)]
pub struct BallHistoryData {
    base: BallData,
    ignore_player_collision: bool,
    hit_pair: HitPair,
    rally: u8,
}

pub struct Ball {
    moves: CircularBuffer<BallHistoryData, MOVEMENT_BUFFER_CAP>,
}

#[derive(Debug, Eq, PartialEq)]
#[repr(u16)]
pub enum BallTickResult {
    /// No special event happened.
    None,
    /// Ball went outside circle.
    Outside,
    /// A regular bounce.
    Bounce,
}

impl BallData {
    /// Calculates line collision.
    fn collide(
        &self,
        p2: Vector,
        p3: Vector,
        p4: Vector,
        spin: f32,
    ) -> Option<(Vector, Vector, Vector, f32)> {
        let denom = ((p4.y() - p3.y()) * (p2.x() - self.pos.x()))
            - ((p4.x() - p3.x()) * (p2.y() - self.pos.y()));
        if denom != 0.0 {
            let ua = (((p4.x() - p3.x()) * (self.pos.y() - p3.y()))
                - ((p4.y() - p3.y()) * (self.pos.x() - p3.x())))
                / denom;
            if (0.0..=1.0).contains(&ua) {
                let ub = (((p2.x() - self.pos.x()) * (self.pos.y() - p3.y()))
                    - ((p2.y() - self.pos.y()) * (self.pos.x() - p3.x())))
                    / denom;
                if (0.0..=1.0).contains(&ub) {
                    let collision_pt = self.pos + (p2 - self.pos) * ua;
                    return Some((collision_pt, p3, p4, spin));
                }
            }
        }
        None
    }
}

impl Ball {
    /// Creates a new ball.
    pub fn new(pos: Vector, angle: f32) -> Self {
        //debug!("{:?}", pos);
        let initial = BallHistoryData {
            base: BallData {
                pos,
                dir: Vector::from_angle(angle) * DEFAULT_BALL_SPEED,
                spin: 0.0,
            },
            ignore_player_collision: false,
            hit_pair: HitPair::none(),
            rally: 0,
        };
        Self {
            moves: CircularBuffer::new(initial),
        }
    }

    /// Last rally count.
    #[inline]
    pub fn last_rally(&self) -> u8 {
        self.moves.last().rally
    }

    /// Last hit team.
    #[inline]
    pub fn last_hit_pair(&self) -> HitPair {
        self.moves.last().hit_pair
    }

    /// Last hit team.
    #[inline]
    pub fn last_hit_team(&self) -> u8 {
        self.moves.last().hit_pair.hit_team()
    }

    /// Reset characteristics.
    pub fn reset_characteristics(&mut self, (pos, angle): (Vector, f32)) {
        let last = self.moves.last_mut();
        last.base.pos = pos;
        last.base.dir = Vector::from_angle(angle) * DEFAULT_BALL_SPEED;
        last.base.spin = 0.0;
    }

    /// Reset other fields.
    pub fn reset_other_fields_for_respawn(&mut self) {
        let last = self.moves.last_mut();
        last.ignore_player_collision = false;
        last.hit_pair = HitPair::none();
        last.rally = 0;
    }

    /// Get characteristics: pos & dir.
    #[inline]
    pub fn characteristics(&self) -> BallData {
        self.moves.last().base
    }

    /// Rewrite history.
    pub fn rewind_and_apply(&mut self, amount: usize, rewritten_history: BallHistoryData) {
        self.moves.rewind(amount);
        self.moves.push(rewritten_history);
    }

    /// Calculates the spin direction modification.
    pub fn calculate_direction_modification(dir: Vector, spin: f32, delta: f32) -> Vector {
        // How much should move in a single 60FPS frame.
        const ACC: f32 = 0.25; // Includes mass et al.
        dir - dir.perp() * spin * ACC * delta
    }

    /// Tick without updating self state.
    pub fn tick_no_update(
        &self,
        room_data: RoomDataForBall,
        player_iter: PlayerIter,
        time_index: usize,
    ) -> (BallTickResult, Option<PowerUpEffect>, BallHistoryData) {
        let last = self.moves[time_index];

        // How much spin?
        let spin = if room_data.spin_towards_center {
            let move_dir = last.base.dir;
            let center_dir = Vector::new(FIELD_WIDTH / 2.0, FIELD_HEIGHT / 2.0) - last.base.pos;
            let cross = move_dir.cross(center_dir.normalized_safe());
            //debug!("cross {}", cross);
            let scaled_cross = cross * 0.01f32;
            last.base.spin + clampf32(scaled_cross, -0.05, 0.05)
        } else {
            last.base.spin
        };

        let new_dir = Self::calculate_direction_modification(last.base.dir, spin, room_data.delta);
        let new = last.base.pos + new_dir * room_data.delta;
        let newh = new - Vector::new(FIELD_WIDTH / 2.0, FIELD_HEIGHT / 2.0);

        // Player collision checking.
        let mut pt = None;
        if !last.ignore_player_collision {
            let angle = newh.angle_positive();
            for player in player_iter {
                // Filter players to make this less expensive
                let player = player.borrow();
                let (pos, hipos) = player.past_pos_bounds();
                if pos > angle + BALL_RADIUS_ANGLE || hipos < angle - BALL_RADIUS_ANGLE {
                    continue;
                }

                let bb = player.bounds();
                let spin = player.spin();

                if let Some(local_pt) = last
                    .base
                    .collide(new, bb.tl, bb.tr, spin)
                    .or_else(|| last.base.collide(new, bb.bl, bb.br, spin))
                {
                    pt = Some((local_pt, player.team_nr()));
                    break;
                }
            }
        }

        // Check for power-up collision.
        let mut power_up_effect = None;
        if last.hit_pair.hit_team() != NO_TEAM {
            if let Some(power_up) = room_data.power_up {
                if power_up.collides(last.base.pos, new) {
                    debug!("Power-up collision!");
                    power_up_effect = Some(PowerUpEffect {
                        effect_type: power_up.effect_type(),
                        activating_team: last.hit_pair.hit_team(),
                    });
                }
            }
        }

        let generate_clean_history = || BallHistoryData {
            base: BallData {
                pos: new,
                dir: new_dir,
                spin: last.base.spin,
            },
            ignore_player_collision: false,
            hit_pair: last.hit_pair,
            rally: last.rally,
        };

        if let Some((pt, hit_team)) = pt {
            // First calculate the normal
            let n = (pt.2 - pt.1).perp().normalized();
            //debug!("{:?}", n);

            // 2 * dot(d, n)
            let dot = 2.0 * n.dot(new_dir);

            // Dot product will be more and more positive if roughly pointing to the same direction.
            // In that case, ignore the collision because it's a double.
            if dot <= 0.0 {
                // Reflection
                let new_dir = new_dir - n * dot;
                //debug!(
                //    "ball: Bounce {} {} {} {} {}",
                //    pt.0, pt.1, new_dx, new_dy, pt.6
                //);

                // Spin
                let spin = clampf32(last.base.spin * 0.5 + pt.3, -SPIN_MAX, SPIN_MAX);

                (
                    BallTickResult::Bounce,
                    power_up_effect,
                    BallHistoryData {
                        base: BallData {
                            pos: pt.0,
                            dir: new_dir,
                            spin,
                        },
                        ignore_player_collision: true,
                        hit_pair: HitPair::new(hit_team, NO_TEAM),
                        rally: last.rally.wrapping_add(1).min(MAX_RALLIES),
                    },
                )
            } else {
                (
                    BallTickResult::None,
                    power_up_effect,
                    generate_clean_history(),
                )
            }
        } else {
            let mut history = generate_clean_history();

            const THRESHOLD: f32 = CIRCLE_RADIUS + 125.0;
            // Check if outside the circle.
            let btr = if newh.len_sqr() > THRESHOLD * THRESHOLD {
                if last.hit_pair.receiving_team() == NO_TEAM {
                    // Register losing team such that a sharp course of the ball will not
                    // cause the wrong team to lose.
                    let team_angle = std::f32::consts::PI * 2.0 / (room_data.team_count as f32);
                    // +2*PI needed because otherwise negative value modulo issues.
                    let angle = newh.angle() + std::f32::consts::PI * 2.0;
                    let team = ((angle / team_angle) as u32) % room_data.team_count;
                    history.hit_pair = HitPair::new(history.hit_pair.hit_team(), team as u8);
                }

                BallTickResult::Outside
            } else {
                BallTickResult::None
            };
            (btr, power_up_effect, history)
        }
    }

    pub fn has_collision(&self, time_index: usize) -> bool {
        self.moves[time_index].ignore_player_collision
    }

    pub fn tick(
        &mut self,
        room_data: RoomDataForBall,
        player_iter: PlayerIter,
        time_index: usize,
    ) -> (BallTickResult, Option<PowerUpEffect>) {
        let (result, power_up_effect, history) =
            self.tick_no_update(room_data, player_iter, time_index);
        if result == BallTickResult::Bounce {
            self.moves.last_mut().ignore_player_collision = true;
        }
        self.moves.push(history);
        (result, power_up_effect)
    }
}
