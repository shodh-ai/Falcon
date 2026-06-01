'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function PlacementMockInterviewsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get('/api/placement/mock-interviews').then(setRows).catch(() => setRows([]));
  }, [api]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Mock Interviews</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map((m) => (
          <li key={String(m.interview_id)} className="rounded border p-3">
            {String(m.student_name)} · Interviewer {String(m.interviewer_name ?? 'TBA')} · Score {String(m.score ?? '—')}
          </li>
        ))}
      </ul>
    </div>
  );
}
