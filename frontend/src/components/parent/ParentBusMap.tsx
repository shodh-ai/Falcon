'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { io, type Socket } from 'socket.io-client';
import { useAuthedApi } from '@/lib/api';
import type { BusLocation } from '@/components/transport/TransportMap';

const TransportMap = dynamic(
  () => import('@/components/transport/TransportMap').then((m) => m.TransportMap),
  { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded-2xl bg-muted" /> },
);

type LiveBus = {
  route_id: string;
  route_name: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lng: number | null;
  location: BusLocation | null;
  eta_minutes: number | null;
};

export function ParentBusMap({ studentUserId }: { studentUserId: string }) {
  const api = useAuthedApi();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const [live, setLive] = useState<LiveBus | null>(null);
  const [busLocation, setBusLocation] = useState<BusLocation | null>(null);

  useEffect(() => {
    void api
      .get<{ live_bus: LiveBus | null }>(`/api/parent/students/${studentUserId}/tracking`)
      .then((res) => {
        setLive(res.live_bus);
        if (res.live_bus?.location) setBusLocation(res.live_bus.location);
      })
      .catch(() => setLive(null));
  }, [api, studentUserId]);

  useEffect(() => {
    if (!live?.route_id) return;
    const socket: Socket = io(`${apiUrl}/transport`, { transports: ['websocket'] });
    socket.emit('joinRoute', { route_id: live.route_id });
    socket.on('gps_update', (payload: BusLocation & { route_id: string }) => {
      if (payload.route_id === live.route_id) {
        setBusLocation({ lat: payload.lat, lng: payload.lng, speed: payload.speed });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [apiUrl, live?.route_id]);

  if (!live) {
    return (
      <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No active university bus pass for this student.
      </p>
    );
  }

  const center: [number, number] =
    live.stop_lat && live.stop_lng
      ? [live.stop_lat, live.stop_lng]
      : busLocation
        ? [busLocation.lat, busLocation.lng]
        : [26.9124, 75.7434];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        <p className="font-semibold text-sgvu-navy">{live.route_name}</p>
        <p className="text-xs text-muted-foreground">Pickup: {live.stop_name}</p>
        {live.eta_minutes != null ? (
          <p className="mt-1 text-sm font-medium text-emerald-700">ETA ~{live.eta_minutes} min</p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border shadow-sm">
        <TransportMap
          center={center}
          stops={
            live.stop_lat && live.stop_lng
              ? [{ stop_id: 'home', stop_name: live.stop_name, latitude: live.stop_lat, longitude: live.stop_lng }]
              : []
          }
          busLocation={busLocation}
          height={280}
        />
      </div>
    </div>
  );
}
