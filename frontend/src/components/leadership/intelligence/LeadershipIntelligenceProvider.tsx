'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { useLeadershipApi, type FeedEvent, type IntelligenceTicker } from '@/lib/api/api.leadership';

type IntelligenceContextValue = {
  ticker: IntelligenceTicker | null;
  feed: FeedEvent[];
  alertCount: number;
  connected: boolean;
  refreshTicker: () => void;
  refreshFeed: () => void;
};

const IntelligenceContext = createContext<IntelligenceContextValue | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function LeadershipIntelligenceProvider({ children }: { children: ReactNode }) {
  const api = useLeadershipApi();
  const { user, token } = useAuth();
  const tenantId = user?.tenant_id;
  const [ticker, setTicker] = useState<IntelligenceTicker | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const refreshTicker = useCallback(() => {
    void api.ticker().then(setTicker).catch((err: unknown) => {
      if (err instanceof Error && err.message === 'Unauthorized') return;
      setTicker(null);
    });
  }, [api]);

  const refreshFeed = useCallback(() => {
    void api.feed(50).then(setFeed).catch((err: unknown) => {
      if (err instanceof Error && err.message === 'Unauthorized') return;
      setFeed([]);
    });
  }, [api]);

  useEffect(() => {
    refreshTicker();
    refreshFeed();
    const interval = setInterval(refreshTicker, 60_000);
    return () => clearInterval(interval);
  }, [refreshTicker, refreshFeed]);

  useEffect(() => {
    if (!token || !tenantId) return;
    const socket: Socket = io(`${API_URL}/leadership`, { transports: ['websocket'], auth: { token } });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('joinLeadershipFeed', { tenant_id: tenantId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('feed_event', (event: FeedEvent) => {
      setFeed((prev) => [event, ...prev].slice(0, 100));
      if (event.event_type === 'ALERT') {
        setAlertCount((c) => c + 1);
      }
      refreshTicker();
    });
    return () => {
      socket.disconnect();
    };
  }, [refreshTicker, tenantId, token]);

  const value = useMemo(
    () => ({ ticker, feed, alertCount, connected, refreshTicker, refreshFeed }),
    [ticker, feed, alertCount, connected, refreshTicker, refreshFeed],
  );

  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;
}

export function useLeadershipIntelligence() {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) {
    throw new Error('useLeadershipIntelligence must be used within LeadershipIntelligenceProvider');
  }
  return ctx;
}

export function useLeadershipIntelligenceOptional() {
  return useContext(IntelligenceContext);
}
