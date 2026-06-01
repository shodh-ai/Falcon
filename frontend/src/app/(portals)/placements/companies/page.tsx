'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function PlacementCompaniesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get<Record<string, unknown>[]>('/api/placement/companies').then(setRows).catch(() => setRows([]));
  }, [api]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Company Master</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map((c) => (
          <li key={String(c.company_id)} className="rounded border p-3">
            {String(c.company_name)} · {String(c.hr_email)} · {String(c.industry ?? '—')}
          </li>
        ))}
      </ul>
    </div>
  );
}
