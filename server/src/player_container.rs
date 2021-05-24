use crate::ball::{Ball, BallTickResult, RoomDataForBall, MOVEMENT_BUFFER_CAP};
use crate::bot::{BallMask, Bot};
use crate::player::{ClientId, Player, SeqNr};
use crate::protocol::{BallSync, ClientMoveUpdate, ClientSync};
use crate::room::{MAX_TEAMS, TPF};
use crate::shared_room_data::SharedRoomData;
use crate::team_data::TeamData;
use fnv::FnvHashMap;
use smallvec::SmallVec;
use std::cell::RefCell;
use std::collections::hash_map::{IterMut, Values, ValuesMut};

pub struct PlayerContainer {
    container: FnvHashMap<ClientId, RefCell<Player>>,
    team_data: [TeamData; MAX_TEAMS as usize],
}

impl PlayerContainer {
    pub fn new() -> Self {
        Self {
            container: Default::default(),
            team_data: [Default::default(); MAX_TEAMS as usize],
        }
    }

    /// Inserts a new player.
    pub fn insert(&mut self, id: ClientId, player: Player) {
        self.container.insert(id, RefCell::new(player));
    }

    /// Removes a player.
    pub fn remove(&mut self, id: ClientId) -> Option<RefCell<Player>> {
        self.container.remove(&id)
    }

    /// Gets the player count.
    #[inline]
    pub fn count(&self) -> usize {
        self.container.len()
    }

    /// Values iterator.
    #[inline]
    pub fn values(&self) -> Values<'_, u32, RefCell<Player>> {
        self.container.values()
    }

    /// Values mut iterator.
    #[inline]
    pub fn values_mut(&mut self) -> ValuesMut<'_, u32, RefCell<Player>> {
        self.container.values_mut()
    }

    /// Values mut iterator.
    #[inline]
    pub fn iter_mut(&mut self) -> IterMut<'_, u32, RefCell<Player>> {
        self.container.iter_mut()
    }

    /// Sets the speed of a team.
    pub fn set_team_speed(&mut self, team_nr: u8, speed: f32) {
        for (_, td) in self
            .team_data
            .iter_mut()
            .enumerate()
            .filter(|(i, _)| *i != team_nr as usize)
        {
            td.set_speed(speed);
        }
    }

    /// Queues a move for a player.
    pub fn queue_move_for(&mut self, id: ClientId, update: ClientMoveUpdate) {
        if let Some(player) = self.container.get_mut(&id) {
            let player = player.get_mut();
            player.queue_move(update, &self.team_data[player.team_nr() as usize]);
        }
    }

    /// Ticks the bot players.
    pub fn tick_bots(&mut self, bots: &[Bot], balls: &[Ball]) {
        // We need to keep track of the ball masks of individual teams as to not conflict the decisions.
        let mut ball_masks = [BallMask::new(); MAX_TEAMS];

        for bot in bots.iter() {
            let bot_player = self
                .container
                .get(&bot.id())
                .expect("bot should have associated player")
                .borrow();
            let team_nr = bot_player.team_nr() as usize;
            let bot_tick_result = bot.calculate_move(
                &*bot_player,
                balls,
                //&self.team_data[bot_player.team_nr() as usize],
                ball_masks[team_nr],
            );
            drop(bot_player);
            self.queue_move_for(bot.id(), bot_tick_result.move_update);
            ball_masks[team_nr] |= bot_tick_result.ball_mask;
        }
    }

    /// Handles late collisions.
    pub fn handle_late_collisions(
        &mut self,
        frame_time: SeqNr,
        balls: &mut [Ball],
        shared_data: &SharedRoomData,
    ) -> (Vec<ClientSync>, SmallVec<[BallSync; 3]>) {
        let mut client_syncs = Vec::new();
        let mut ball_syncs = SmallVec::new();

        for (player_id, player_refcell) in self.container.iter() {
            let mut player = player_refcell.borrow_mut();
            if let Some(sync) = player.tick(*player_id) {
                client_syncs.push(sync);
            }

            if let Some(ball_hit) = player.ball_hit() {
                let ball = &mut balls[ball_hit.id() as usize];

                // Necessary because we want a regular borrow to process the ball.
                drop(player);
                let player = player_refcell.borrow();

                let mut collides = || {
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

                    let room_data_for_ball = RoomDataForBall {
                        delta: TPF as f32,
                        team_count: shared_data.nr_teams().into(),
                        power_up: None,
                        spin_towards_center: shared_data.spin_towards_center(),
                    };

                    for i in (index.saturating_sub(1)..=index).rev() {
                        if ball.has_collision(i) {
                            debug!("Early escape because collision already ACK'd");
                            break;
                        }

                        if let (BallTickResult::Bounce, _, rewritten_history) = ball.tick_no_update(
                            room_data_for_ball,
                            self.container
                                .values()
                                .filter(&|&p| std::ptr::eq(p, player_refcell)),
                            i,
                        ) {
                            ball.rewind_and_apply(offset as _, rewritten_history);

                            for _ in index..(MOVEMENT_BUFFER_CAP - 1) {
                                ball.tick(
                                    room_data_for_ball,
                                    self.container.values().filter(&|_| true),
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
                                self.container
                                    .values()
                                    .filter(&|&p| std::ptr::eq(p, player_refcell)),
                                i,
                            )
                            .0
                        );
                    }

                    false
                };

                if collides() {
                    // Yes, something did happen in the past we didn't see!
                    ball_syncs.push(BallSync::new(ball_hit.id(), 1, &ball));
                    debug!("queued a correction");
                }
            } else {
                // Necessary to sync up dropping.
                drop(player);
            }

            let mut player = player_refcell.borrow_mut();
            player.reset_ball_hit();
        }

        (client_syncs, ball_syncs)
    }
}
