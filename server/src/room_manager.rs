use crate::protocol::MessageToInbox;
use crate::room::{room_loop, SharedRoomData};
use chrono::Local;
use futures::channel::mpsc::{self, UnboundedSender};
use std::collections::HashMap;
use std::mem::swap;
use std::net::IpAddr;
use std::ops::Deref;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub type RoomId = u64;

const BITCNT: u64 = 40;
const BITMASK: u64 = (1 << (BITCNT / 2)) - 1;
const ROUNDS: u64 = 10;
const ALPHABET: [u8; 32] = *b"T48W1GVJF37AYEB256IPMS90ZDHRKLXQ";

const MAX_ROOM_CREATIONS_PER_IP: u32 = 12;

pub struct RoomData {
    sender: UnboundedSender<MessageToInbox>,
    shared_data: Arc<SharedRoomData>,
}

pub struct RoomManager {
    rooms: HashMap<RoomId, RoomData>,
    playing_rooms: HashMap<RoomId, RoomData>,
    ip_count: HashMap<IpAddr, u32>,
    next_room_counter: RoomId,
    xor_thing: u64,
}

pub enum RoomSpawnFailReason {
    /// We limit the amount of rooms that can be created from an IP address to partially prevent DoS.
    TooManyFromSameIp,
}

impl RoomManager {
    /// Creates a new RoomManager.
    pub fn new() -> Self {
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards");

        Self {
            rooms: Default::default(),
            playing_rooms: Default::default(),
            ip_count: Default::default(),
            next_room_counter: 0,
            xor_thing: time.as_secs(),
        }
    }

    /// Round function in cipher for room id.
    fn round(nr: u64, round: u64) -> u64 {
        (((nr ^ (65521 + round * 3)).wrapping_add(11)) << 1) & BITMASK
    }

    /// Transform counter to room id using Feistel cipher.
    fn crypt(&self, nr: u64) -> u64 {
        let nr = nr ^ self.xor_thing;
        let mut left = nr >> (BITCNT / 2);
        let mut right = nr & BITMASK;
        for i in 0..ROUNDS {
            left ^= Self::round(right, i);
            swap(&mut left, &mut right);
        }
        left | (right << (BITCNT / 2))
    }

    /// Transform a number to a string code.
    fn code_to_str(mut nr: u64) -> String {
        let mut s = String::with_capacity((BITCNT / 5) as usize);
        for _ in 0..(BITCNT / 5) {
            s.push(char::from(ALPHABET[(nr & ((1 << 5) - 1)) as usize]));
            nr >>= 5;
        }
        s
    }

    /// Transform a string code to a number.
    fn str_to_code(s: &str) -> Option<u64> {
        let mut nr = 0u64;
        for (i, c) in s.chars().enumerate() {
            if let Some(index) = ALPHABET.iter().position(|&x| x == c as u8) {
                nr |= (index << (5 * i)) as u64;
            } else {
                return None;
            }
        }

        Some(nr)
    }

    /// Increase count for an IP.
    pub fn increase_count(&mut self, ip: IpAddr, force: bool) -> Result<(), RoomSpawnFailReason> {
        if let Some(count) = self.ip_count.get_mut(&ip) {
            if !force && *count >= MAX_ROOM_CREATIONS_PER_IP {
                return Err(RoomSpawnFailReason::TooManyFromSameIp);
            }
            *count += 1;
        } else {
            self.ip_count.insert(ip, 1);
        }
        Ok(())
    }

    /// Spawns a new room.
    pub fn spawn(
        &mut self,
        creator: IpAddr,
        name: String,
    ) -> Result<(String, UnboundedSender<MessageToInbox>), RoomSpawnFailReason> {
        self.increase_count(creator, false)?;
        let id = self.crypt(self.next_room_counter);
        self.next_room_counter += 1;
        let (inbox_tx, inbox_rx) = mpsc::unbounded::<MessageToInbox>();
        let shared_data = Arc::new(SharedRoomData::new(name));
        tokio::task::spawn(room_loop(inbox_rx, id, shared_data.clone()));
        self.rooms.insert(
            id,
            RoomData {
                sender: inbox_tx.clone(),
                shared_data,
            },
        );
        Ok((Self::code_to_str(id), inbox_tx))
    }

    /// List rooms.
    pub async fn list(&self) -> Vec<(String, SharedRoomData)> {
        let mut v = Vec::with_capacity(self.rooms.len());
        for (&id, data) in self.rooms.iter() {
            v.push((Self::code_to_str(id), data.shared_data.deref().clone()));
        }
        v
    }

    /// Gets the transmit channel for a room.
    pub fn get_tx(&self, room_id: &str) -> Option<UnboundedSender<MessageToInbox>> {
        Self::str_to_code(room_id)
            .and_then(|id| self.rooms.get(&id).map(|data| data.sender.clone()))
    }

    /// Mark a room as playing.
    pub fn mark_as_playing(&mut self, id: RoomId) {
        if let Some(room_data) = self.rooms.remove(&id) {
            println!("[{}] play {}", Local::now().format("%d-%m %H:%M"), id);
            self.playing_rooms.insert(id, room_data);
        }
    }

    /// Unmark a room as playing.
    pub fn unmark_as_playing(&mut self, id: RoomId) {
        if let Some(room_data) = self.playing_rooms.remove(&id) {
            self.rooms.insert(id, room_data);
        }
    }

    /// Removes a room.
    pub fn remove(&mut self, id: RoomId) {
        if self.rooms.remove(&id).is_none() {
            self.playing_rooms.remove(&id);
        }
    }

    /// Owner leaves a room, update IP counts.
    pub fn owner_leave(&mut self, ip: IpAddr) {
        if let Some(count) = self.ip_count.get_mut(&ip) {
            *count -= 1;
            if *count == 0 {
                self.ip_count.remove(&ip);
            }
        }
    }

    /// Gets the number of playing rooms.
    #[inline]
    pub fn playing_rooms(&self) -> usize {
        self.playing_rooms.len()
    }
}
