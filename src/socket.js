// src/socket.js
//
// Thin wrapper around socket.io-client so the rest of the app doesn't need
// to know connection details. One shared socket connection is reused for
// the whole app; components join rooms ("staff" or "customer:<whatsapp>")
// to receive the events relevant to them.

import { io } from "socket.io-client";
import { API_URL } from "./api.js";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, { autoConnect: true, transports: ["websocket", "polling"] });
  }
  return socket;
}

export function joinRoom(room) {
  getSocket().emit("join", { room });
}
