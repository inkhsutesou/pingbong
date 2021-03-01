#![feature(map_first_last)]
#![allow(clippy::new_without_default)]
#![allow(clippy::mistyped_literal_suffixes)]
#![allow(clippy::many_single_char_names)]

#[macro_use]
extern crate static_assertions;

mod bincode;
#[macro_use]
mod util;
mod ball;
mod circular_buffer;
mod player;
mod powerup;
mod protocol;
mod room;
mod room_manager;
mod team_data;
mod vector;

use crate::player::accept_connection;
use crate::room_manager::RoomManager;
use futures::lock::Mutex;
use lazy_static::lazy_static;
use std::env;
use tokio::net::TcpListener;

type Rooms = Mutex<RoomManager>;

lazy_static! {
    static ref ROOMS: Rooms = Mutex::new(RoomManager::new());
}

/// Gets the rooms
#[inline]
pub fn rooms() -> &'static Rooms {
    &ROOMS
}

/// Main entry point.
#[tokio::main]
async fn main() {
    // Setup the websocket server.
    let addr = env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:4242".to_string());
    let sock = TcpListener::bind(&addr).await.expect("server socket");

    while let Ok((stream, _client_addr)) = sock.accept().await {
        //debug!("connection from {:?}", _client_addr.ip());
        tokio::spawn(accept_connection(stream));
    }
}
