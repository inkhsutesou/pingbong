use crate::ball::{Ball, HitPair};
use crate::player::{Client, ClientId, SeqNr};
use crate::powerup::PowerUp;
use crate::room::{MatchTime, SharedRoomData};
use crate::vector::Vector;
use futures::channel::oneshot;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;

#[derive(Serialize, Copy, Clone)]
pub struct Join<'a> {
    pub client_id: ClientId,
    pub name: &'a str,
}

#[derive(Serialize)]
pub struct PlayerAlreadyJoinedData<'a> {
    pub spawn_msg: Join<'a>,
}

#[derive(Serialize)]
pub struct ClientSync {
    pub client_id: ClientId,
    pub pos: f32,
    pub seq_nr: SeqNr,
}

#[derive(Serialize)]
pub struct JoinedRoom<'a> {
    pub client_id: ClientId,
    pub host_id: ClientId,
    pub already_joined: &'a [PlayerAlreadyJoinedData<'a>],
    pub settings: UpdateSettings,
}

#[derive(Serialize)]
pub struct Leave<'a> {
    pub left_client_id: ClientId,
    pub new_host_id: ClientId,
    pub rebalance: &'a Option<RebalanceTeam>,
}

#[derive(Serialize)]
pub struct StartState {
    pub client_id: ClientId,
    pub team_nr: u8,
    pub pos: f32,
    pub w_angle: f32,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct BallData {
    pub pos: Vector,
    pub dir: Vector,
    pub spin: f32,
}

#[derive(Serialize)]
pub struct Start<'a> {
    pub team_count: u8,
    pub spin_towards_center: bool,
    pub match_time: f32,
    pub states: &'a [StartState],
    pub balls: &'a [BallData],
}

#[derive(Serialize)]
pub struct BallSync {
    pub index_rally_packed: u8,
    pub hit_pair: HitPair,
    pub flags: u8,
    pub characteristics: BallData,
}

impl BallSync {
    pub fn new(idx: u8, flags: u8, ball: &Ball) -> Self {
        Self {
            index_rally_packed: (idx << 4) | ball.last_rally(),
            hit_pair: ball.last_hit_pair(),
            flags,
            characteristics: ball.characteristics(),
        }
    }
}

#[derive(Serialize)]
pub struct SyncMessage {
    pub frame_nr: f32,
    pub client_syncs: Vec<ClientSync>,
    pub ball_syncs: SmallVec<[BallSync; 3]>,
    pub power_up: PowerUpPacket,
}

#[derive(Debug, Serialize)]
pub struct RebalanceTeam {
    pub min_pos: f32,
    pub max_pos: f32,
    pub w_angle: f32,
}

#[derive(Debug, Serialize)]
pub enum PowerUpPacket {
    None,
    SpawnPowerUp(PowerUp),
    ResizePlayers(u8, RebalanceTeam),
    BonusPoints(u8),
    SplitRGB(u8),
    RotateField(u8),
    SlowDown(u8, f32),
}

#[derive(Serialize)]
pub enum OutdatedReason {
    Client,
    Server,
}

#[derive(Serialize)]
pub enum MessageToClient<'a> {
    Ack,
    Join(Join<'a>),
    Leave(Leave<'a>),
    Sync(&'a SyncMessage),
    CreatedRoom(String),
    JoinedRoom(JoinedRoom<'a>),
    ListRooms(usize, &'a [(String, SharedRoomData)]),
    JoinRoomError,
    Start(&'a Start<'a>),
    NameError,
    TooManyRooms,
    Outdated(OutdatedReason),
    UpdateSettings(UpdateSettings),
    ResetRoom,
}

#[derive(Debug, Deserialize)]
pub struct ClientMoveUpdate {
    pub delta: f32,
    pub seq_nr: SeqNr,
    pub ball_hit: u8,
    pub spin: f32,
}

#[derive(Deserialize)]
pub struct JoinRequest {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone)]
pub struct UpdateSettings {
    pub balls: u8,
    pub power_ups: bool,
    pub match_time: MatchTime,
    pub spin_towards_center: bool,
}

#[derive(Deserialize)]
pub enum RoomMessageFromClient {
    Move(ClientMoveUpdate),
    Leave,
    Start,
    UpdateSettings(UpdateSettings),
}

#[derive(Deserialize)]
pub enum LobbyMessageFromClient {
    CreateRoom,
    JoinRoom(String),
    ListRooms,
}

#[derive(Deserialize)]
pub enum LoginMessageFromClient {
    SetName(u32, String),
}

/// Internal join data for player.
#[derive(Debug)]
pub struct JoinData {
    pub id: ClientId,
}

/// Game processing inbox.
/// This is a send-receive channel to communicate between player async managers and the room async manager.
#[derive(Debug)]
pub enum MessageToInbox {
    JoinPlayer(oneshot::Sender<JoinData>, Client, String),
    RemovePlayer(oneshot::Sender<Client>, ClientId),
    MovePlayer(ClientId, ClientMoveUpdate),
    Start(ClientId),
    UpdateSettings(ClientId, UpdateSettings),
}
