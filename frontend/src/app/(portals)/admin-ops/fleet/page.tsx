'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function AdminOpsFleetPage() {
  const api = useAuthedApi();
  const [fleet, setFleet] = useState<Record<string, unknown>[]>([]);
  const [fuel, setFuel] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<Record<string, unknown>[]>('/api/admin-ops/fleet').catch((e) => {
        setError(String((e as Error)?.message ?? e));
        return [];
      }),
      api.get<Record<string, unknown>[]>('/api/admin-ops/fleet/fuel-logs').catch(() => []),
    ]).then(([f, fl]) => {
      setFleet(f);
      setFuel(fl);
    });
  }, [api]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Fleet & Transport</h1>
      {error && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {/forbidden/i.test(error)
            ? 'Fleet management is restricted to Transport Officer / Registrar roles. For asset write-offs use Asset Lifecycle (ALM) under Tokamak Labs.'
            : error}
        </div>
      )}
      <section>
        <h2 className="font-semibold">Vehicles</h2>
        {!fleet.length && !error && (
          <p className="mt-2 text-sm text-muted-foreground">No vehicles listed.</p>
        )}
        <ul className="mt-2 space-y-2 text-sm">
          {fleet.map((v) => (
            <li key={String(v.vehicle_id)} className="rounded border p-3">
              {String(v.registration_no)} · Driver {String(v.driver_name ?? '—')} ·{' '}
              {String(v.route_zone ?? v.route_details ?? '')}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Fuel logs</h2>
        {!fuel.length && !error && (
          <p className="mt-2 text-sm text-muted-foreground">No fuel logs.</p>
        )}
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
