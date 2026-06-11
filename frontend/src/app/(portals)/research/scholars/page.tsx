'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

const PHASES = ['COURSEWORK', 'RDC_APPROVAL', 'SYNOPSIS_SUBMISSION', 'PRE_PHD', 'THESIS_EVAL', 'VIVA_VOCE', 'AWARD'];

export default function ResearchScholarsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    void api.get<Record<string, unknown>[]>('/api/research/scholars').then(setRows).catch(() => setRows([]));
  }, [api]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Ph.D. Scholar Pipeline</h1>
      <p className="text-sm text-muted-foreground">Coursework → RDC → Synopsis → Pre-PhD → Thesis → Viva → Award</p>
      <div className="mt-6 grid gap-3">
        {rows.map((r) => (
          <div key={String(r.scholar_id)} className="rounded-xl border p-4">
            <p className="font-semibold text-sgvu-navy">{String(r.scholar_name ?? 'Scholar')}</p>
            <p className="text-sm text-muted-foreground">{String(r.research_topic)}</p>
            <p className="mt-2 text-xs">Guide: {String(r.guide_name ?? '—')}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {PHASES.map((p) => (
                <span
                  key={p}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.current_phase === p ? 'bg-sgvu-navy text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {p.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
