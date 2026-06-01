'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function AdminOpsFleetPage() {
  const api = useAuthedApi();
  const [fleet, setFleet] = useState<Record<string, unknown>[]>([]);
  const [fuel, setFuel] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get('/api/admin-ops/fleet').then(setFleet);
    void api.get('/api/admin-ops/fleet/fuel-logs').then(setFuel);
  }, [api]);
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Fleet & Transport</h1>
      <section>
        <h2 className="font-semibold">Vehicles</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {fleet.map((v) => (
            <li key={String(v.vehicle_id)} className="rounded border p-3">
              {String(v.registration_no)} · Driver {String(v.driver_name ?? '—')} · {String(v.route_zone ?? v.route_details ?? '')}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Fuel logs</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {fuel.map((f) => (
            <li key={String(f.fuel_log_id)} className="rounded border p-3">
              {String(f.registration_no)} · {String(f.litres)}L on {String(f.fuel_date)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
