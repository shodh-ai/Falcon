'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function PlacementTrainingPage() {
  const api = useAuthedApi();
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get<Record<string, unknown>[]>('/api/placement/training-sessions').then(setSessions).catch(() => setSessions([]));
  }, [api]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Skill Mapping & Training</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {sessions.map((s) => (
          <li key={String(s.session_id)} className="rounded border p-3">
            {String(s.title)} · {new Date(String(s.session_date)).toLocaleString()}
          </li>
        ))}
        {!sessions.length && <p className="text-muted-foreground">Schedule aptitude sessions from Placement Cell.</p>}
      </ul>
    </div>
  );
}
