'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function ResearchGrantsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    void api.get<Record<string, unknown>[]>('/api/research/grants').then(setRows).catch(() => setRows([]));
  }, [api]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Grant & Funding Ledger</h1>
      <p className="text-sm text-muted-foreground">Micro-ledger for DST/AICTE grants — separate from tuition revenue.</p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No grants recorded yet. Add via R&D cell onboarding.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">Grant</th>
              <th className="p-2">Agency</th>
              <th className="p-2">Sanctioned</th>
              <th className="p-2">Utilized</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.grant_id)} className="border-b">
                <td className="p-2">{String(r.grant_title)}</td>
                <td className="p-2">{String(r.funding_agency)}</td>
                <td className="p-2">₹{Number(r.sanctioned_amount).toLocaleString()}</td>
                <td className="p-2">₹{Number(r.utilized_amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
