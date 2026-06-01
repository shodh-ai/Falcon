'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function AdminOpsAssetsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get('/api/admin-ops/assets').then(setRows).catch(() => setRows([]));
  }, [api]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Inventory & Assets</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={String(r.asset_id)} className="rounded border p-3">
            {String(r.asset_tag)} — {String(r.name)} · {String(r.status)} · Room {String(r.assigned_room ?? '—')}
          </li>
        ))}
      </ul>
    </div>
  );
}
