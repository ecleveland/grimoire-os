import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

let socket: Socket | null = null;

function getSocketOrigin(): string {
  return API_URL.replace(/\/api\/?$/, '');
}

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (socket) {
    return socket;
  }
  const token = window.localStorage.getItem('token');
  if (!token) {
    return null;
  }
  socket = io(getSocketOrigin(), {
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
