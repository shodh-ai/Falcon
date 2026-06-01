'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function ParentDashboardPage() {
  const api = useAuthedApi();
  const [overview, setOverview] = useState<{ children: Array<{ name: string; official_email: string }> } | null>(null);

  useEffect(() => {
    void api.get('/api/parent/overview').then(setOverview).catch(() => setOverview(null));
  }, [api]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Parent Dashboard</h1>
      <p className="text-sm text-muted-foreground">Read-only academic health and fee visibility for your child.</p>
      {(overview?.children ?? []).map((c) => (
        <div key={c.name} className="rounded-lg border p-4">
          <p className="font-semibold">{c.name}</p>
          <p className="text-sm text-muted-foreground">{c.official_email}</p>
        </div>
      ))}
    </div>
  );
}
