import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { CardSkeleton } from '@/components/Skeleton';
import { API_URL } from '@/lib/config';
import { useTransportLive } from '@/hooks/useAcademics';

export default function TransportScreen() {
  const live = useTransportLive();
  const [gps, setGps] = useState<{ lat: number; lng: number; speed?: number } | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!live.data?.route_id) return;
    let socket: Socket | null = null;

    socket = io(`${API_URL}/transport`, { transports: ['websocket'] });
    socket.on('connect', () => {
      setConnected(true);
      socket?.emit('joinRoute', { route_id: live.data?.route_id });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('gps_update', (payload: { lat: number; lng: number; speed?: number }) => {
      setGps(payload);
    });

    return () => {
      socket?.disconnect();
    };
  }, [live.data?.route_id]);

  const isRefreshing = live.isRefetching;

  return (
    <Screen scroll refreshing={isRefreshing} onRefresh={() => void live.refetch()}>
      <View className="gap-4 pb-6">
        {live.isLoading ? (
          <CardSkeleton lines={4} />
        ) : !live.data ? (
          <Card>
            <Text className="text-sm text-sgvu-navy/60">
              No transport allocation found. Opt in via the web portal first.
            </Text>
          </Card>
        ) : (
          <>
            <Card>
              <Text className="text-lg font-bold text-sgvu-navy">{live.data.route_name}</Text>
              <Text className="text-sm text-sgvu-navy/60 mt-1">Stop: {live.data.stop_name}</Text>
              <View className="flex-row items-center gap-2 mt-3">
                <View
                  className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-400'}`}
                />
                <Text className="text-xs text-sgvu-navy/60">
                  {connected ? 'Live GPS connected' : 'Connecting…'}
                </Text>
              </View>
            </Card>

            <Card>
              <Text className="text-sm font-semibold text-sgvu-navy/60">ETA</Text>
              <Text className="text-3xl font-black text-sgvu-navy mt-1">
                {live.data.eta_minutes != null ? `${live.data.eta_minutes} min` : '—'}
              </Text>
            </Card>

            <Card>
              <Text className="text-base font-bold text-sgvu-navy mb-3">Bus Location</Text>
              {gps ? (
                <View className="gap-1">
                  <Text className="text-sm text-sgvu-navy">
                    Lat: {gps.lat.toFixed(5)} · Lng: {gps.lng.toFixed(5)}
                  </Text>
                  {gps.speed != null ? (
                    <Text className="text-sm text-sgvu-navy/60">Speed: {gps.speed} km/h</Text>
                  ) : null}
                </View>
              ) : live.data.location ? (
                <Text className="text-sm text-sgvu-navy">
                  Lat: {live.data.location.lat.toFixed(5)} · Lng:{' '}
                  {live.data.location.lng.toFixed(5)}
                </Text>
              ) : (
                <Text className="text-sm text-sgvu-navy/60">Waiting for GPS update…</Text>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
