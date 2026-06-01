'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function AdminOpsEventsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get('/api/admin-ops/events').then(setRows).catch(() => setRows([]));
  }, [api]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Event Management</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map((e) => (
          <li key={String(e.event_id)} className="rounded border p-3">
            <p className="font-semibold">{String(e.title)}</p>
            <p className="text-muted-foreground">
              {String(e.venue)} · Guest pass {String(e.guest_pass_code)} · Budget ₹{String(e.budget_amount)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
