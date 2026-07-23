'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { ExamCellEmptyState } from '@/components/exam-cell/ExamCellEmptyState';
import { useAuthedApi } from '@/lib/api';

type Task = {
  id: string;
  title: string;
  count: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  href: string;
};

const PRIORITY_VARIANT: Record<Task['priority'], 'destructive' | 'default' | 'secondary'> = {
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
};

export default function ExamCellMyTasksPage() {
  const api = useAuthedApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await api.get<Task[]>('/api/exam-cell/my-tasks'));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[my-tasks]', e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="my-tasks" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pending actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : tasks.length === 0 ? (
            <ExamCellEmptyState message="No pending tasks right now. Create sample examination data to explore workflows." onRetry={() => void load()} />
          ) : tasks.map((t) => (
            <Link key={t.id} href={t.href} className="flex items-center justify-between rounded-lg border px-4 py-3 transition hover:border-sgvu-gold/40">
              <div>
                <p className="font-medium text-sgvu-navy">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.count} item{t.count !== 1 ? 's' : ''} pending</p>
              </div>
              <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
