'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import { toast } from '@/lib/notifications/falcon-toast';
import { Bus, QrCode } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import type { BusLocation, MapStop } from '@/components/transport/TransportMap';

const TransportMap = dynamic(
  () => import('@/components/transport/TransportMap').then((m) => m.TransportMap),
  { ssr: false, loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-muted" /> },
);

type NearbyStop = MapStop & {
  route_id: string;
  route_name: string;
  fee_amount: number;
  distance_km: number;
  seats_available: number;
  pickup_time: string;
};

type Allocation = {
  allocation_id: string;
  route_name: string;
  stop_name: string;
  fee_amount: string;
  payment_status: string;
  pass_status: string;
  route_id: string;
  bus_number?: string;
};

type LiveData = {
  route_id: string;
  route_name: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lng: number | null;
  location: BusLocation | null;
  eta_minutes: number | null;
};

type QrPayload = {
  qr_payload: string;
  expires_at: string;
  route_name: string;
  stop_name: string;
};

const DEFAULT_CENTER: [number, number] = [26.9124, 75.7434];

type Tab = 'find' | 'pass' | 'track';

export default function StudentTransportPage() {
  const api = useAuthedApi();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [tab, setTab] = useState<Tab>('find');
  const [home, setHome] = useState<[number, number]>(DEFAULT_CENTER);
  const [address, setAddress] = useState('');
  const [stops, setStops] = useState<NearbyStop[]>([]);
  const [selected, setSelected] = useState<NearbyStop | null>(null);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [pendingPay, setPendingPay] = useState<{ allocation_id: string; amount: number } | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [busLocation, setBusLocation] = useState<BusLocation | null>(null);
  const [routeChangeReason, setRouteChangeReason] = useState('');
  const [routeChangeOpen, setRouteChangeOpen] = useState(false);

  const loadAllocation = useCallback(() => {
    void api.get<Allocation | null>('/api/transport/my-allocation').then((a) => {
      setAllocation(a);
      if (a?.payment_status === 'PAID') setTab('pass');
      if (a?.payment_status === 'PENDING') {
        setPendingPay({ allocation_id: a.allocation_id, amount: Number(a.fee_amount) });
      }
    });
  }, [api]);

  const loadNearby = useCallback(
    (lat: number, lng: number) => {
      void api
        .get<NearbyStop[]>(`/api/transport/stops/nearby?lat=${lat}&lng=${lng}&limit=12`)
        .then(setStops)
        .catch(() => setStops([]));
    },
    [api],
  );

  useEffect(() => {
    loadAllocation();
    loadNearby(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setHome(coords);
          loadNearby(coords[0], coords[1]);
        },
        () => undefined,
        { enableHighAccuracy: false, timeout: 8000 },
      );
    }
  }, [loadAllocation, loadNearby]);

  useEffect(() => {
    if (allocation?.pass_status !== 'ACTIVE') return;
    const refresh = () => {
      void api.get<QrPayload>('/api/transport/bus-pass/qr').then(setQr).catch(() => undefined);
    };
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [api, allocation?.pass_status]);

  useEffect(() => {
    if (tab !== 'track' || !allocation?.route_id) return;

    const loadLive = () => {
      void api.get<LiveData>('/api/transport/live').then((data) => {
        setLive(data);
        if (data.location) setBusLocation(data.location);
      });
    };
    loadLive();

    const socket: Socket = io(`${apiUrl}/transport`, { transports: ['websocket'] });
    socket.emit('joinRoute', { route_id: allocation.route_id });
    socket.on('gps_update', (payload: BusLocation & { route_id: string }) => {
      if (payload.route_id === allocation.route_id) {
        setBusLocation({ lat: payload.lat, lng: payload.lng, speed: payload.speed });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [api, apiUrl, tab, allocation?.route_id]);

  async function requestRouteChange() {
    if (routeChangeReason.trim().length < 10) {
      toast.error('Provide a reason (10+ characters)');
      return;
    }
    try {
      await api.post('/api/transport/request-route-change', { reason: routeChangeReason.trim() });
      toast.success('Route change request sent to Transport Officer');
      setRouteChangeOpen(false);
      setRouteChangeReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    }
  }

  async function geocodeAddress() {
    if (!address.trim()) {
      toast.error('Enter your home area or landmark');
      return;
    }
    const hash = address.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const lat = 26.85 + (hash % 100) / 1000;
    const lng = 75.75 + ((hash >> 4) % 100) / 1000;
    setHome([lat, lng]);
    loadNearby(lat, lng);
    toast.success('Showing nearest stops');
  }

  async function optIn() {
    if (!selected) return;
    try {
      const res = await api.post<{ allocation: Allocation; route: { fee_amount: number } }>(
        '/api/transport/opt-in',
        { stop_id: selected.stop_id },
      );
      setPendingPay({
        allocation_id: res.allocation.allocation_id,
        amount: res.route.fee_amount,
      });
      loadAllocation();
      toast.success('Fee demand created — complete payment to activate pass');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opt-in failed');
    }
  }

  async function confirmPayment() {
    if (!pendingPay) return;
    try {
      await api.post('/api/transport/confirm-payment', {
        allocation_id: pendingPay.allocation_id,
        payment_ref: `MOCK-UPI-${Date.now()}`,
      });
      toast.success('Transport pass activated!');
      setPendingPay(null);
      loadAllocation();
      setTab('pass');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed');
    }
  }

  const mapStops: MapStop[] = useMemo(
    () =>
      stops.map((s) => ({
        stop_id: s.stop_id,
        stop_name: s.stop_name,
        route_name: s.route_name,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        fee_amount: s.fee_amount,
        distance_km: s.distance_km,
        selected: selected?.stop_id === s.stop_id,
      })),
    [stops, selected],
  );

  const trackCenter: [number, number] = useMemo(() => {
    if (busLocation) return [busLocation.lat, busLocation.lng];
    if (live?.stop_lat && live?.stop_lng) return [live.stop_lat, live.stop_lng];
    return home;
  }, [busLocation, live, home]);

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Transport Hub"
        description="Find your route, pay zone-based fees, show your digital bus pass, and track your bus live."
      />

      <StudentTabBar
        tabs={[
          { id: 'find' as Tab, label: 'Find Route', shortLabel: 'Find' },
          { id: 'pass' as Tab, label: 'My Pass', shortLabel: 'Pass' },
          { id: 'track' as Tab, label: 'Track Bus', shortLabel: 'Track' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'find' && (
        <>
          {allocation?.payment_status === 'PAID' ? (
            <Card className="border-sgvu-gold/40 bg-sgvu-gold/5">
              <CardHeader>
                <CardTitle className="text-base">Your Route</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-lg font-bold text-sgvu-navy">
                  {allocation.route_name} | Stop: {allocation.stop_name}
                </p>
                <p className="text-muted-foreground">Pickup is locked to this stop for the semester.</p>
                {!routeChangeOpen ? (
                  <Button variant="outline" onClick={() => setRouteChangeOpen(true)}>
                    Request Route Change
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Why do you need a different route?"
                      value={routeChangeReason}
                      onChange={(e) => setRouteChangeReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void requestRouteChange()}>Submit to Transport Officer</Button>
                      <Button variant="ghost" onClick={() => setRouteChangeOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where do you board from?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input
                placeholder="e.g. Vaishali Nagar, Jaipur"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="max-w-sm"
              />
              <Button onClick={() => void geocodeAddress()}>Find nearest stops</Button>
              <Button variant="outline" onClick={() => loadNearby(home[0], home[1])}>
                Use GPS
              </Button>
            </CardContent>
          </Card>

          <TransportMap
            center={home}
            homeLocation={home}
            stops={mapStops}
            height={300}
            onSelectStop={(s) => {
              const full = stops.find((x) => x.stop_id === s.stop_id) ?? null;
              setSelected(full);
            }}
          />

          {selected && (
            <Card className="border-sgvu-gold/40">
              <CardHeader>
                <CardTitle className="text-base">{selected.stop_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">{selected.route_name}</span> · Pickup {selected.pickup_time?.slice(0, 5)}
                </p>
                <p className="text-lg font-bold text-sgvu-navy">
                  ₹{selected.fee_amount.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ semester</span>
                </p>
                <p className="text-muted-foreground">
                  {selected.distance_km.toFixed(1)} km from you · {selected.seats_available} seats left
                </p>
                {!allocation || allocation.payment_status !== 'PAID' ? (
                  <Button className="bg-sgvu-navy" onClick={() => void optIn()}>
                    Opt-In & Pay
                  </Button>
                ) : (
                  <p className="font-medium text-emerald-700">You are enrolled on this route.</p>
                )}
              </CardContent>
            </Card>
          )}

          {pendingPay && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <div>
                  <p className="font-semibold text-amber-900">Payment pending</p>
                  <p className="text-sm text-amber-800">₹{pendingPay.amount.toLocaleString()} transport fee</p>
                </div>
                <Button onClick={() => void confirmPayment()}>Pay now (mock Razorpay)</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All nearby stops</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {stops.map((s) => (
                <button
                  key={s.stop_id}
                  type="button"
                  className="flex w-full justify-between rounded-lg border px-3 py-2 text-left hover:border-sgvu-gold"
                  onClick={() => setSelected(s)}
                >
                  <span>
                    {s.stop_name} <span className="text-muted-foreground">· {s.route_name}</span>
                  </span>
                  <span className="font-medium">₹{s.fee_amount.toLocaleString()}</span>
                </button>
              ))}
            </CardContent>
          </Card>
            </>
          )}
        </>
      )}

      {tab === 'pass' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bus className="h-5 w-5 text-sgvu-gold" />
              Digital Bus Pass
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allocation?.pass_status === 'ACTIVE' && qr ? (
              <>
                <div className="mx-auto flex h-48 w-48 flex-col items-center justify-center rounded-2xl border-4 border-sgvu-gold bg-white p-4">
                  <QrCode className="h-24 w-24 text-sgvu-navy" />
                  <p className="mt-2 text-center text-[10px] font-mono break-all">{qr.qr_payload.slice(0, 40)}…</p>
                </div>
                <p className="text-center text-sm">
                  {qr.route_name} · {qr.stop_name}
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Refreshes every 30s · Show to conductor when boarding
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Complete route opt-in and payment to activate your anti-theft dynamic QR pass.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'track' && (
        <>
          {allocation?.pass_status !== 'ACTIVE' ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Activate your transport pass to track your assigned bus in real time.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6">
                  <div>
                    <p className="font-semibold">{live?.route_name ?? allocation.route_name}</p>
                    <p className="text-sm text-muted-foreground">Your stop: {live?.stop_name ?? allocation.stop_name}</p>
                  </div>
                  {live?.eta_minutes != null && (
                    <p className="text-2xl font-black text-sgvu-navy">ETA ~{live.eta_minutes} min</p>
                  )}
                </CardContent>
              </Card>
              <TransportMap
                center={trackCenter}
                stops={[]}
                busLocation={busLocation}
                height={300}
                homeLocation={
                live?.stop_lat && live?.stop_lng ? [live.stop_lat, live.stop_lng] : null
              } />
              {!busLocation && (
                <p className="text-center text-sm text-muted-foreground">
                  Waiting for live GPS from your bus… (Transport officer can simulate from admin portal)
                </p>
              )}
            </>
          )}
        </>
      )}
    </StudentPageShell>
  );
}
