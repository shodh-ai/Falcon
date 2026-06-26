'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import type { BusLocation } from '@/components/transport/TransportMap';

const TransportMap = dynamic(
  () => import('@/components/transport/TransportMap').then((m) => m.TransportMap),
  { ssr: false, loading: () => <div className="h-[480px] animate-pulse rounded-xl bg-muted" /> },
);

type FleetRoute = {
  route_id: string;
  route_name: string;
  total_seats: number;
  registration_no: string | null;
  occupancy: number;
};

type FleetMapData = {
  routes: FleetRoute[];
  locations: Array<{ route_id: string; location: BusLocation | null }>;
};

type OccupancyData = {
  routes: Array<FleetRoute & { paid_count: number; pending_count: number }>;
  unpaid_students: Array<{ name: string; official_email: string; route_name: string; stop_name: string }>;
};

const DEFAULT_CENTER: [number, number] = [26.9124, 75.7434];

export default function TransportAdminPage() {
  const api = useAuthedApi();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [fleet, setFleet] = useState<FleetMapData | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [busLocations, setBusLocations] = useState<Record<string, BusLocation>>({});

  const [routeName, setRouteName] = useState('');
  const [stopForm, setStopForm] = useState({
    route_id: '',
    stop_name: '',
    latitude: '26.9124',
    longitude: '75.7434',
    pickup_time: '07:30',
    fee_amount: '12000',
  });

  const load = () => {
    void api.get<FleetMapData>('/api/transport/admin/fleet-map').then((data) => {
      setFleet(data);
      const locs: Record<string, BusLocation> = {};
      for (const l of data.locations) {
        if (l.location) locs[l.route_id] = l.location;
      }
      setBusLocations(locs);
    });
    void api.get<OccupancyData>('/api/transport/admin/occupancy').then(setOccupancy);
  };

  useEffect(() => {
    load();
    const socket: Socket = io(`${apiUrl}/transport`, { transports: ['websocket'] });
    socket.emit('joinFleet');
    socket.on('fleet_gps_update', (payload: BusLocation & { route_id: string }) => {
      setBusLocations((prev) => ({
        ...prev,
        [payload.route_id]: { lat: payload.lat, lng: payload.lng, speed: payload.speed },
      }));
    });
    return () => {
      socket.disconnect();
    };
  }, [api, apiUrl]);

  const mapCenter = useMemo((): [number, number] => {
    const locs = Object.values(busLocations);
    if (locs[0]) return [locs[0].lat, locs[0].lng];
    return DEFAULT_CENTER;
  }, [busLocations]);

  async function createRoute() {
    try {
      await api.post('/api/transport/admin/routes', { route_name: routeName, total_seats: 40 });
      toast.success('Route created');
      setRouteName('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function addStop() {
    try {
      await api.post(`/api/transport/admin/routes/${stopForm.route_id}/stops`, {
        stop_name: stopForm.stop_name,
        latitude: Number(stopForm.latitude),
        longitude: Number(stopForm.longitude),
        pickup_time: stopForm.pickup_time,
        fee_amount: Number(stopForm.fee_amount),
      });
      toast.success('Stop added');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function simulateGps(routeId: string) {
    try {
      await api.post(`/api/transport/gps/simulate/${routeId}`);
      toast.success('GPS ping sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Simulate failed');
    }
  }

  const [scanQr, setScanQr] = useState('');
  const [scanResult, setScanResult] = useState<{ student_name: string; status: string; message: string } | null>(null);

  async function scanPass() {
    try {
      const res = await api.post<typeof scanResult>('/api/transport/scan-pass', { qr_payload: scanQr });
      setScanResult(res);
      toast.success(res?.message ?? 'Scanned');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid pass');
      setScanResult(null);
    }
  }

  const busMarkers = fleet?.routes
    .filter((r) => busLocations[r.route_id])
    .map((r) => ({
      stop_id: r.route_id,
      stop_name: r.route_name,
      latitude: busLocations[r.route_id].lat,
      longitude: busLocations[r.route_id].lng,
    })) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Transport Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Live fleet map, route builder, zone pricing, and occupancy across all buses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live fleet map</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TransportMap
            center={mapCenter}
            stops={busMarkers}
            busLocation={busMarkers[0] ? busLocations[busMarkers[0].stop_id] : null}
            height={480}
          />
          <div className="flex flex-wrap gap-2">
            {(fleet?.routes ?? []).map((r) => (
              <Button key={r.route_id} size="sm" variant="outline" onClick={() => void simulateGps(r.route_id)}>
                Simulate GPS · {r.route_name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Route builder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Route name" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
            <Button onClick={() => void createRoute()}>Create route</Button>

            <hr className="my-2" />
            <p className="text-xs font-semibold uppercase text-muted-foreground">Add stop (click map coords)</p>
            <Select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={stopForm.route_id}
              onChange={(e) => setStopForm((f) => ({ ...f, route_id: e.target.value }))}
            >
              <option value="">Select route</option>
              {(fleet?.routes ?? []).map((r) => (
                <option key={r.route_id} value={r.route_id}>
                  {r.route_name}
                </option>
              ))}
            </Select>
            <Input placeholder="Stop name" value={stopForm.stop_name} onChange={(e) => setStopForm((f) => ({ ...f, stop_name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Lat" value={stopForm.latitude} onChange={(e) => setStopForm((f) => ({ ...f, latitude: e.target.value }))} />
              <Input placeholder="Lng" value={stopForm.longitude} onChange={(e) => setStopForm((f) => ({ ...f, longitude: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Pickup HH:MM" value={stopForm.pickup_time} onChange={(e) => setStopForm((f) => ({ ...f, pickup_time: e.target.value }))} />
              <Input placeholder="Fee ₹" value={stopForm.fee_amount} onChange={(e) => setStopForm((f) => ({ ...f, fee_amount: e.target.value }))} />
            </div>
            <Button variant="secondary" onClick={() => void addStop()}>
              Drop pin & save stop
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Occupancy dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(occupancy?.routes ?? []).map((r) => {
              const pct = r.total_seats ? Math.round((r.paid_count / r.total_seats) * 100) : 0;
              const overbooked = r.paid_count > r.total_seats;
              return (
                <div key={r.route_id} className="rounded-lg border p-3">
                  <div className="flex justify-between font-semibold">
                    <span>{r.route_name}</span>
                    <span className={overbooked ? 'text-red-600' : ''}>
                      {r.paid_count}/{r.total_seats} {overbooked && '· OVERBOOKED'}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${overbooked ? 'bg-red-500' : 'bg-sgvu-gold'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.pending_count} pending payment · Bus {r.registration_no ?? 'TBA'}
                  </p>
                </div>
              );
            })}

            {occupancy?.unpaid_students?.length ? (
              <>
                <p className="pt-2 text-xs font-bold uppercase text-muted-foreground">Unpaid opt-ins</p>
                {occupancy.unpaid_students.map((u) => (
                  <p key={u.official_email} className="text-xs">
                    {u.name} — {u.route_name} / {u.stop_name}
                  </p>
                ))}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conductor pass scanner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Paste student QR payload" value={scanQr} onChange={(e) => setScanQr(e.target.value)} />
            <Button onClick={() => void scanPass()}>Validate boarding pass</Button>
            {scanResult && (
              <p className={`text-sm font-semibold ${scanResult.status === 'GREEN' ? 'text-emerald-700' : 'text-red-600'}`}>
                {scanResult.status} — {scanResult.student_name}: {scanResult.message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
