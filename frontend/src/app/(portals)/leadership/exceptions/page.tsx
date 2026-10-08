'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import Link from 'next/link';

export default function LeadershipExceptionsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    void api
      .get<any[]>('/api/dofa/exceptions')
      .then(setRows)
      .catch(() => setRows([]));
  }, [api]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Management by Exception
        </p>
        <h1 className="text-3xl font-black text-sgvu-navy">Chairman Exceptions</h1>
        <p className="text-sm text-slate-600 max-w-2xl">
          The university runs itself through DOFA. You only see items where normal limits failed —
          over-limit hire, SLA breach &gt; 10 days, or explicit escalation. Daily P2P and grade
          changes stay with middle management.
        </p>
        <p className="text-xs">
          <Link href="/approvals/dofa-inbox" className="underline">
            Unified DOFA inbox
          </Link>
        </p>
        {!rows.length && (
          <p className="text-sm text-muted-foreground rounded-lg border bg-white p-6">
            No open exceptions. The engine is quiet — that is the goal.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.case_id} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase text-amber-700">{r.domain}</div>
            <div className="font-semibold text-slate-900">{r.title}</div>
            <div className="text-sm text-slate-600 mt-1">{r.exception_reason || 'Escalated'}</div>
            <div className="text-xs text-slate-400 mt-2">
              {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
