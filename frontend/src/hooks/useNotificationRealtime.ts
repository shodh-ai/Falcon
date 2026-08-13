'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-base-url';

const FALLBACK_POLL_MS = 60_000;
const CONNECTED_POLL_MS = 0;

/** Shared realtime connection state for notification SWR hooks. */
let connectedClients = 0;
let socketConnected = false;
const listeners = new Set<() => void>();

function setSocketConnected(next: boolean) {
  socketConnected = next;
  listeners.forEach((fn) => fn());
}

export function getNotificationPollInterval() {
  return socketConnected ? CONNECTED_POLL_MS : FALLBACK_POLL_MS;
}

export function useNotificationSocketConnected() {
  const [connected, setConnected] = useState(socketConnected);
  useEffect(() => {
    const onChange = () => setConnected(socketConnected);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return connected;
}

/**
 * Maintains a JWT-authenticated Socket.IO connection to `/notifications`.
 * On `notification:created`, dispatches `falcon:notifications-refresh`.
 * Auto-reconnects via socket.io defaults after network loss.
 */
export function useNotificationRealtime() {
  const { token, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        connectedClients = Math.max(0, connectedClients - 1);
        if (connectedClients === 0) setSocketConnected(false);
      }
      return;
    }

    const base = getApiBaseUrl().replace(/\/$/, '');
    const socket = io(`${base}/notifications`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;
    connectedClients += 1;

    const bump = () => {
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
    };

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => {
      // Keep fallback polling until reconnect succeeds.
      if (!socket.connected) setSocketConnected(false);
    });
    socket.on('notification:created', bump);
    socket.on('notifications:ready', bump);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('notification:created');
      socket.off('notifications:ready');
      socket.disconnect();
      socketRef.current = null;
      connectedClients = Math.max(0, connectedClients - 1);
      if (connectedClients === 0) setSocketConnected(false);
    };
  }, [isAuthenticated, token]);
}
