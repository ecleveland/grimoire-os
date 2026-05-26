'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

export interface UseSocketResult {
  socket: Socket | null;
  isConnected: boolean;
}

export function useSocket(): UseSocketResult {
  const [socket] = useState<Socket | null>(() => getSocket());
  const [isConnected, setIsConnected] = useState<boolean>(() => socket?.connected ?? false);

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return { socket, isConnected };
}
