use crate::ball::{Ball, BallTickResult, RoomDataForBall, BALL_RADIUS, MOVEMENT_BUFFER_CAP};
use crate::bot::Bot;
use crate::player::{Client, ClientId, Player, SeqNr};
use crate::player_container::PlayerContainer;
use crate::powerup::{PowerUp, PowerUpEffect, PowerUpEffectType};
use crate::protocol::{
    BallSync, Join, JoinData, JoinedRoom, Leave, MessageToClient, MessageToInbox,
    PlayerAlreadyJoinedData, PowerUpPacket, RebalanceTeam, Start, StartState, SyncMessage,
};
use crate::room_manager::RoomId;
use crate::rooms;
use crate::shared_room_data::SharedRoomData;
use crate::team_data::SLOWDOWN_FACTOR;
use crate::tracker::Tracker;
use crate::vector::Vector;
use bytes::Bytes;
use fnv::FnvHashMap;
use futures::channel::mpsc::UnboundedReceiver;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
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

pub struct Room {
    id: RoomId,
    players: PlayerContainer,
    clients: FnvHashMap<ClientId, Client>,
    bots: Vec<Bot>,
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
            players: PlayerContainer::new(),
            clients: Default::default(),
            bots: Vec::new(),
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
            counts[p.borrow().team_nr() as usize] += 1;
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

    /// Gets the client count.
    pub fn client_count(&self) -> usize {
        self.clients.len()
    }

    /// Broadcasts a message to all clients.
    pub async fn broadcast(&mut self, msg: MessageToClient<'_>) {
        let bytes: Bytes = crate::bincode::serialize(&msg).expect("encode").into();
        for client in self.clients.values_mut() {
            client.send_bytes(bytes.clone()).await;
        }
    }

    /// Broadcasts a message to all clients except one.
    pub async fn broadcast_except(&mut self, msg: MessageToClient<'_>, except: ClientId) {
        let bytes: Bytes = crate::bincode::serialize(&msg).expect("encode").into();
        for (_, client) in self.clients.iter_mut().filter(|(&id, _)| id != except) {
            client.send_bytes(bytes.clone()).await;
        }
    }

    /// Adds a new bot.
    pub async fn add_bot(&mut self, name: String) {
        let id = self.create_client_id();
        self.add_player(id, name).await;
        self.bots.push(Bot::new(id));
    }

    /// Removes the last bot.
    pub async fn remove_last_bot(&mut self) {
        if let Some(bot) = self.bots.pop() {
            let id = bot.id();
            self.remove_player(id).await;
        }
    }

    /// Adds a player.
    pub async fn add_player(&mut self, id: ClientId, name: String) {
        let player = Player::new(name, /*self.least_populated_team()*/ 0);

        self.broadcast_except(
            MessageToClient::Join(Join {
                client_id: id,
                name: player.name(),
            }),
            id,
        )
        .await;

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
                p.get_mut().set_team_nr(next);
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
            let p = p.get_mut();
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
            .iter_mut()
            .map(|(&client_id, p)| {
                let p = p.get_mut();
                StartState {
                    client_id,
                    team_nr: p.team_nr(),
                    pos: p.current_pos(),
                    w_angle: p.w_angle(),
                }
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
            .filter(|p| p.borrow().team_nr() == team_nr)
            .count() as u8;

        let mut data = None;
        if max_in_team > 0 {
            for player in self
                .players
                .values_mut()
                .filter(|p| p.borrow().team_nr() == team_nr)
            {
                let player = player.get_mut();
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
    pub async fn remove_player(&mut self, client_id: ClientId) -> Option<Client> {
        let player = self
            .players
            .remove(client_id)
            .expect("player should not be removed already");
        self.shared_data.update_player_count(u16::MAX);
        let client = self.clients.remove(&client_id);
        if self.host_client_id == client_id {
            let mut rooms = rooms().lock().await;
            rooms.owner_leave(client.as_ref().expect("owner should have a client").ip());
            // Handle host migration (only if there are still players).
            if let Some((&id, client)) = self.clients.iter().next() {
                self.host_client_id = id;
                let _ = rooms.increase_count(client.ip(), true);
            }
        }
        let rebalance = &if self.is_started {
            self.rebalance_team(player.borrow().team_nr())
        } else {
            None
        };
        self.broadcast(MessageToClient::Leave(Leave {
            left_client_id: client_id,
            new_host_id: self.host_client_id,
            rebalance,
        }))
        .await;
        client
    }

    /// Reset the tick delay.
    fn reset_delay(&mut self) {
        self.tick_delay = time::interval(TICK_TIME);
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
                self.players
                    .set_team_speed(power_up_effect.activating_team, SLOWDOWN_FACTOR);
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
                            self.players.set_team_speed(activating_team, 1.0);
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

    /// Creates a new client id.
    fn create_client_id(&mut self) -> ClientId {
        // Update and create data.
        let id = self.next_client_id;
        self.next_client_id += 1;
        id
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

        // Ticks bot
        self.players.tick_bots(&self.bots, &self.balls);

        // Handle late collisions
        let (client_syncs, mut ball_syncs) = self.players.handle_late_collisions(
            self.frame_timer,
            &mut self.balls,
            &self.shared_data,
        );

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
                let client = self
                    .remove_player(id)
                    .await
                    .expect("real player should have a client");
                sender.send(client).expect("send client");

                if self.client_count() == 0 {
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
                    self.players.count()
                );
                if !self.is_started && sender == self.host_client_id && self.players.count() > 1 {
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

            MessageToInbox::MovePlayer(id, update) => {
                if self.is_started {
                    self.players.queue_move_for(id, update);
                }
            }

            MessageToInbox::JoinPlayer(join_tx, mut client, name) => {
                debug_assert!(!self.is_started);

                let id = self.create_client_id();

                // If the player is not the creator of the room.
                if id > 0 {
                    let already_joined = self
                        .players
                        .iter_mut()
                        .map(|(&id, player)| PlayerAlreadyJoinedData {
                            spawn_msg: Join {
                                client_id: id,
                                name: player.get_mut().name(),
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

                self.add_player(id, name).await;
                self.clients.insert(id, client);
                join_tx.send(JoinData { id }).expect("join data");
            }

            MessageToInbox::AddBot(sender) => {
                if !self.is_started && sender == self.host_client_id && self.bots.len() < 10 {
                    self.add_bot(format!("Bot {}", self.bots.len() + 1)).await;
                }
            }

            MessageToInbox::RemoveBot(sender) => {
                if !self.is_started && sender == self.host_client_id {
                    self.remove_last_bot().await;
                }
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
