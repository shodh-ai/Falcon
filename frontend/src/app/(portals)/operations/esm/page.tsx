'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [queues, setQueues] = useState<any[]>([]);
  useEffect(() => { void ops.queues().then(setQueues).catch(() => toast.error('Load failed')); }, [ops]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">ESM Queues</h1>
      {queues.map((q) => (
        <Card key={q.queue_id}><CardHeader className="pb-2"><CardTitle className="text-base">{q.name}</CardTitle></CardHeader>
          <CardContent className="text-sm">Category {q.category} → {q.assignee_role}</CardContent></Card>
      ))}
    </div>
  );
}
