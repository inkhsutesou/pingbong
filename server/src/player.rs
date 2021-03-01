use crate::ball::{BALL_RADIUS, BALL_RADIUS_ANGLE, NO_TEAM, SPIN_MAX};
use crate::protocol::{
    ClientMoveUpdate, ClientSync, JoinData, LobbyMessageFromClient, LoginMessageFromClient,
    MessageToClient, MessageToInbox, OutdatedReason, RoomMessageFromClient,
};
use crate::room::{CIRCLE_RADIUS, FIELD_HEIGHT, FIELD_WIDTH};
use crate::room_manager::RoomSpawnFailReason;
use crate::rooms;
use crate::team_data::TeamData;
use crate::util::clampf32;
use crate::vector::Vector;
use bytes::Bytes;
use futures::channel::mpsc::UnboundedSender;
use futures::channel::oneshot;
use futures::stream::{SplitSink, SplitStream};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use std::net::IpAddr;
use std::num::NonZeroU8;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::{Error, Message};
use tokio_tungstenite::{accept_async_with_config, WebSocketStream};

pub type ClientId = u32;

/// Overflow will happen after ~4.2 billion messages.
/// Assuming a message is sent every 16ms at max, we run out at about 4400 minutes.
pub type SeqNr = u32;

/// Protocol version.
const PROTOCOL_VERSION: u32 = 9;

/// Maximum possible moves per server tick.
const MAX_MOVE_PER_SERVER_TICK: u8 = 2;

/// Maximum length of the move queue.
/// Should be the maximum possible moves per server tick + margin
#[allow(clippy::identity_op)]
const MAX_MOVE_QUEUE: u8 = MAX_MOVE_PER_SERVER_TICK + (1 + 1);

const PLAYER_W_PADDING: f32 = 4.0;

type TxChannel = SplitSink<WebSocketStream<TcpStream>, Message>;
type RxChannel = SplitStream<WebSocketStream<TcpStream>>;

enum PacketResult<T> {
    Ok(T),
    Ignore,
    Err,
}

#[derive(Debug)]
pub struct Client {
    tx: TxChannel,
    ip: IpAddr,
}

pub struct BallHit {
    pos: f32,
    id: NonZeroU8,
}

impl BallHit {
    pub fn new(pos: f32, id: u8) -> Self {
        Self {
            pos,
            id: NonZeroU8::new(id + 1).unwrap(),
        }
    }

    #[inline]
    pub fn pos(&self) -> f32 {
        self.pos
    }

    #[inline]
    pub fn id(&self) -> u8 {
        self.id.get() - 1
    }
}

pub struct Player {
    pos: f32,
    ball_hit: Option<BallHit>,
    move_count: u8,
    spin: f32,
    min_pos: f32,
    max_pos: f32,
    w_angle: f32,
    move_seq_nr: SeqNr,
    client: Client,
    team_nr: u8,
    bounds: PlayerBB,
    name: String,
}

#[derive(Copy, Clone)]
pub struct PlayerBB {
    pub tl: Vector,
    pub tr: Vector,
}

impl Default for PlayerBB {
    fn default() -> Self {
        Self {
            tl: Vector::zero(),
            tr: Vector::zero(),
        }
    }
}

impl Player {
    /// Creates a new Player.
    pub fn new(client: Client, name: String, team_nr: u8) -> Self {
        Self {
            pos: 0.0,
            ball_hit: None,
            move_count: 0,
            spin: 0.0,
            min_pos: 0.0,
            max_pos: 0.0,
            w_angle: 0.0,
            move_seq_nr: 0,
            name,
            client,
            team_nr,
            bounds: Default::default(),
        }
    }

    /// Reset.
    pub fn reset(&mut self) {
        self.move_seq_nr = 0;
        self.move_count = 0;
        self.spin = 0.0;
        self.ball_hit = None;
    }

    #[inline]
    pub fn has_moved(&self) -> bool {
        self.move_count > 0
    }

    #[inline]
    pub fn move_seq_nr(&self) -> SeqNr {
        self.move_seq_nr
    }

    #[inline]
    pub fn name(&self) -> &str {
        &self.name
    }

    #[inline]
    pub fn team_nr(&self) -> u8 {
        self.team_nr
    }

    #[inline]
    pub fn set_team_nr(&mut self, team_nr: u8) {
        self.team_nr = team_nr;
    }

    #[inline]
    pub fn min_pos(&self) -> f32 {
        self.min_pos
    }

    #[inline]
    pub fn max_pos(&self) -> f32 {
        self.max_pos
    }

    #[inline]
    pub fn current_pos(&self) -> f32 {
        self.pos
    }

    pub fn past_pos_bounds(&self) -> (f32, f32) {
        let pos = self.collision_pos();
        (pos, pos + self.w_angle())
        //let min = self.pos.min(self.first_old_pos);
        //let max = self.pos.max(self.first_old_pos);
        //(min, max + self.w_angle())
    }

    #[inline]
    pub fn spin(&self) -> f32 {
        self.spin
    }

    #[inline]
    pub fn w_angle(&self) -> f32 {
        self.w_angle
    }

    #[inline]
    pub fn client_mut(&mut self) -> &mut Client {
        &mut self.client
    }

    #[inline]
    pub fn client(&self) -> &Client {
        &self.client
    }

    pub fn into_client(self) -> Client {
        self.client
    }

    /// Setup for playing.
    pub fn setup(
        &mut self,
        team_angle: f32,
        nr_teams: u32,
        max_in_team: u8,
        player_nr_in_team: u8,
    ) {
        self.setup_min_max_angle(team_angle, nr_teams, max_in_team, 1.0);
        // Divide circle arc into parts.
        // After this we have to put the player in the middle and to account for the width of the pad.
        let my_part_size = team_angle / (max_in_team as f32);

        let pos = self.min_pos
            + (player_nr_in_team as f32) * my_part_size
            + (my_part_size - self.w_angle) * 0.5;

        self.pos = pos;
        self.recalc_bounds();
    }

    /// Setup: min_pos, max_pos & w_angle.
    fn setup_min_max_angle(
        &mut self,
        team_angle: f32,
        nr_teams: u32,
        max_in_team: u8,
        extra_factor: f32,
    ) {
        let player_width = ((240.0 * extra_factor) / (nr_teams as f32)) / (max_in_team as f32);
        self.w_angle = (player_width / CIRCLE_RADIUS).atan();
        self.min_pos = team_angle * (self.team_nr as f32);
        self.max_pos = self.min_pos + team_angle - self.w_angle;
    }

    /// Reset setup for fairness (e.g. team player leaving).
    pub fn reset_setup_for_fairness(
        &mut self,
        team_angle: f32,
        nr_teams: u32,
        max_in_team: u8,
        extra_factor: f32,
    ) {
        let old_w_angle = self.w_angle;
        self.setup_min_max_angle(team_angle, nr_teams, max_in_team, extra_factor);
        let diff_w_angle = (self.w_angle - old_w_angle) * 0.5;
        self.pos = clampf32(self.pos - diff_w_angle, self.min_pos, self.max_pos);
        self.recalc_bounds();
    }

    /// Recalculate bounds.
    fn recalc_bounds(&mut self) {
        let (pos, hipos) = self.past_pos_bounds();

        const FACTOR_LEFT: f32 =
            CIRCLE_RADIUS - (10.0 - 3.0 + PLAYER_W_PADDING + BALL_RADIUS) / 2.0;
        let (si1, co1) = (pos - BALL_RADIUS_ANGLE).sin_cos();
        let (si2, co2) = (hipos + BALL_RADIUS_ANGLE).sin_cos();
        let tlx = co2 * FACTOR_LEFT + FIELD_WIDTH / 2.0;
        let trx = co1 * FACTOR_LEFT + FIELD_WIDTH / 2.0;
        //let tmy = ((hipos + pos) / 2.0).sin() * FACTOR_LEFT + FIELD_HEIGHT / 2.0;
        self.bounds = PlayerBB {
            tl: Vector::new(tlx, si2 * FACTOR_LEFT + FIELD_HEIGHT / 2.0),
            tr: Vector::new(trx, si1 * FACTOR_LEFT + FIELD_HEIGHT / 2.0),
            //tm: Vector((tlx + trx) / 2.0, tmy),
        };
    }

    /// Queue a move action.
    pub fn queue_move(&mut self, update: ClientMoveUpdate, team_data: &TeamData) {
        if self.move_count == MAX_MOVE_QUEUE {
            debug!("drop {} {}", self.move_count, MAX_MOVE_QUEUE);
            return;
        }

        if update.seq_nr <= self.move_seq_nr {
            debug!(
                "drop out of order move {} {}",
                update.seq_nr, self.move_seq_nr
            );
            return;
        }

        // Clamp instead of rejecting because we don't know what could happen with FP issues.
        let delta = clampf32(
            update.delta,
            -team_data.max_move_factor(),
            team_data.max_move_factor(),
        );
        self.pos = clampf32(self.pos + delta, self.min_pos, self.max_pos);
        // *2.0 because it can change the spin completely to the other direction.
        self.spin = clampf32(update.spin, -SPIN_MAX * 2.0, SPIN_MAX * 2.0);

        self.move_seq_nr = update.seq_nr;
        if update.ball_hit != NO_TEAM {
            self.ball_hit = Some(BallHit::new(self.pos, update.ball_hit));
        }
        self.move_count += 1;
    }

    /// Get ball hit.
    pub fn ball_hit(&self) -> Option<&BallHit> {
        self.ball_hit.as_ref()
    }

    /// Reset ball hit.
    pub fn reset_ball_hit(&mut self) {
        self.ball_hit = None;
    }

    /// Get collision pos.
    pub fn collision_pos(&self) -> f32 {
        if let Some(ball_hit) = self.ball_hit() {
            ball_hit.pos()
        } else {
            self.pos
        }
    }

    /// Gets the (rotated) bounds.
    #[inline]
    pub fn bounds(&self) -> PlayerBB {
        self.bounds
    }

    /// Tick.
    pub fn tick(&mut self, id: ClientId) -> Option<ClientSync> {
        let has_moved = self.has_moved();
        if has_moved {
            self.recalc_bounds();
            self.move_count = 0;
        }

        if has_moved {
            Some(ClientSync {
                client_id: id,
                // Players should always get the last available info, not the past info.
                pos: self.current_pos(),
                seq_nr: self.move_seq_nr(),
            })
        } else {
            // Need to reset the spin when standing still.
            self.spin = 0.0;
            None
        }
    }
}

impl Client {
    /// Creates a new Client.
    pub fn new(tx: TxChannel, ip: IpAddr) -> Self {
        Self { tx, ip }
    }

    /// Gets the IP.
    #[inline]
    pub fn ip(&self) -> IpAddr {
        self.ip
    }

    /// Send a message to the player.
    pub async fn send(&mut self, msg: &MessageToClient<'_>) {
        self.send_bytes(crate::bincode::serialize(&msg).expect("encode").into())
            .await
    }

    /// Send bytes to the player.
    pub async fn send_bytes(&mut self, msg: Bytes) {
        let msg = Message::binary(msg);
        let _ = self.tx.send(msg).await;
    }
}

/// Deserializes a message.
#[inline]
fn deserialize_msg<'de, T: Deserialize<'de>>(
    msg: Option<&'de Result<Message, Error>>,
) -> PacketResult<T> {
    match msg {
        Some(Ok(Message::Binary(data))) => match crate::bincode::deserialize::<T>(data.as_ref()) {
            Ok(m) => PacketResult::Ok(m),
            _ => PacketResult::Err,
        },
        Some(Ok(msg)) if msg.is_ping() || msg.is_pong() => PacketResult::Ignore,
        _ => PacketResult::Err,
    }
}

/// Accept client connection.
pub async fn accept_connection(
    stream: TcpStream,
) -> Result<(), tokio_tungstenite::tungstenite::Error> {
    // Disable Nagle's algorithm.
    let _ = stream.set_nodelay(true);
    let ws_cfg = WebSocketConfig {
        max_message_size: Some(8192),
        max_frame_size: Some(8192),
        ..Default::default()
    };
    let ip = stream.peer_addr().expect("peer address should exist").ip();
    let ws_stream = accept_async_with_config(stream, Some(ws_cfg)).await?;
    let (tx, mut rx) = ws_stream.split();
    let name: String;
    let mut client = Client::new(tx, ip);

    // Name selection & sanitization.
    loop {
        match deserialize_msg::<LoginMessageFromClient>(rx.next().await.as_ref()) {
            PacketResult::Ok(LoginMessageFromClient::SetName(version, set_name)) => {
                if version != PROTOCOL_VERSION {
                    client
                        .send(&MessageToClient::Outdated(if version < PROTOCOL_VERSION {
                            OutdatedReason::Client
                        } else {
                            OutdatedReason::Server
                        }))
                        .await;
                    return Ok(());
                }

                if set_name.is_empty()
                    || set_name.len() > 20
                    || !set_name
                        .chars()
                        .all(|x| matches!(x, '0'..='9' | 'A'..='Z' | 'a'..='z' | ' '))
                {
                    client.send(&MessageToClient::NameError).await;
                    continue;
                }
                name = set_name;
                break;
            }
            PacketResult::Ignore => {}
            PacketResult::Err => return Ok(()),
        }
    }

    client.send(&MessageToClient::Ack).await;

    loop {
        match deserialize_msg::<LobbyMessageFromClient>(rx.next().await.as_ref()) {
            PacketResult::Ok(msg) => {
                client = lobby_message(client, &mut rx, msg, &name).await;
            }
            PacketResult::Ignore => {}
            PacketResult::Err => break,
        }
    }

    Ok(())
}

/// Lobby message handler.
async fn lobby_message(
    mut client: Client,
    rx: &mut RxChannel,
    msg: LobbyMessageFromClient,
    name: &str,
) -> Client {
    let rooms = rooms();

    match msg {
        LobbyMessageFromClient::CreateRoom => {
            let result = rooms.lock().await.spawn(client.ip(), name.to_owned());
            match result {
                Ok((room_id, inbox_tx)) => {
                    client.send(&MessageToClient::CreatedRoom(room_id)).await;
                    client = player_connected(client, rx, inbox_tx, name).await;
                }

                Err(RoomSpawnFailReason::TooManyFromSameIp) => {
                    client.send(&MessageToClient::TooManyRooms).await;
                }
            }
        }

        LobbyMessageFromClient::JoinRoom(room_id) => {
            let room = rooms.lock().await.get_tx(room_id.as_str());
            if let Some(inbox_tx) = room {
                client = player_connected(client, rx, inbox_tx, name).await;
            } else {
                client.send(&MessageToClient::JoinRoomError).await;
            }
        }

        LobbyMessageFromClient::ListRooms => {
            let rooms = rooms.lock().await;
            let list = rooms.list().await;
            let playing_count = rooms.playing_rooms();
            drop(rooms);
            let list_slice = list.as_slice();
            client
                .send(&MessageToClient::ListRooms(playing_count, list_slice))
                .await;
        }
    }

    client
}

/// Player connected async loop.
pub async fn player_connected(
    client: Client,
    rx: &mut RxChannel,
    mut inbox_tx: UnboundedSender<MessageToInbox>,
    name: &str,
) -> Client {
    // Setup a one-shot channel for communicating the join message to the inbox.
    let (join_data, mut inbox): (JoinData, UnboundedSender<MessageToInbox>) = {
        let (join_tx, join_rx) = oneshot::channel();

        inbox_tx
            .send(MessageToInbox::JoinPlayer(join_tx, client, name.to_owned()))
            .await
            .expect("connect player");

        // Continue when the join is confirmed.
        (join_rx.await.expect("join data"), inbox_tx)
    };

    // Message handling loop.
    loop {
        match deserialize_msg::<RoomMessageFromClient>(rx.next().await.as_ref()) {
            PacketResult::Ok(msg) => match msg {
                RoomMessageFromClient::Move(msg) => {
                    let _ = inbox
                        .send(MessageToInbox::MovePlayer(join_data.id, msg))
                        .await;
                }

                RoomMessageFromClient::Leave => {
                    break;
                }

                RoomMessageFromClient::Start => {
                    let _ = inbox.send(MessageToInbox::Start(join_data.id)).await;
                }

                RoomMessageFromClient::UpdateSettings(s) => {
                    let _ = inbox
                        .send(MessageToInbox::UpdateSettings(join_data.id, s))
                        .await;
                }
            },
            PacketResult::Ignore => {}
            PacketResult::Err => break,
        }
    }

    // Handle player leave.
    let (leave_tx, leave_rx) = oneshot::channel();
    inbox
        .send(MessageToInbox::RemovePlayer(leave_tx, join_data.id))
        .await
        .expect("leave");
    leave_rx.await.expect("client")
}
