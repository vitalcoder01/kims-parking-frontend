import {io, Socket} from 'socket.io-client';
import {API_BASE_URL} from '../config/api';

// One true-WebSocket connection per logged-in session. The server emits the
// *changed data itself* on every mutation (task:upsert, driver:patch,
// slot:patch, visitor:upsert, notification:new, presence, GPS) — listeners
// patch exactly that entity in state; nothing refetches because of an event.

// socket.io lives at the deployment root, not under /api.
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) disconnectSocket();
  socket = io(SOCKET_URL, {
    transports: ['websocket'], // true sockets only — never long-polling
    auth: {token},
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

/** Driver → server: live GPS ping relayed to the valet/admin map. */
export function emitDriverLocation(lat: number, lng: number): void {
  socket?.emit('driver:location', {lat, lng});
}
