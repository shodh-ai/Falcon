'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type TimelineEvent = {
  stage: string;
  status: string;
  at: string | null;
  detail?: string;
};

type Timeline = {
  student: { name: string; enrollment_number: string | null };
  timeline: TimelineEvent[];
};

export default function ExamCellStudentTimelinePage() {
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const [studentUserId, setStudentUserId] = useState(searchParams.get('student') ?? '');
  const [data, setData] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = searchParams.get('student');
    if (id) void loadForId(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function loadForId(id: string) {
    setStudentUserId(id);
    setLoading(true);
    try {
      setData(await api.get<Timeline>(`/api/exam-cell/students/${id}/timeline`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Timeline not found');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function load() {
    if (!studentUserId.trim()) {
      toast.error('Enter student user ID');
      return;
    }
    await loadForId(studentUserId.trim());
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="student-timeline" />

      <Card>
        <CardContent className="flex gap-2 pt-6">
          <Input placeholder="Student user ID — find via Global Search" value={studentUserId} onChange={(e) => setStudentUserId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} />
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{data.student.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{data.student.enrollment_number ?? '—'}</p>
          </CardHeader>
          <CardContent>
            <ol className="relative border-l border-sgvu-navy/20 pl-6">
              {(data.timeline ?? []).map((ev, i) => (
                <li key={i} className="mb-6 ml-2">
                  <span className="absolute -left-1.5 flex h-3 w-3 rounded-full bg-sgvu-gold ring-4 ring-white" />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sgvu-navy">{ev.stage}</p>
                    <Badge variant="outline">{(ev.status ?? 'UNKNOWN').replace(/_/g, ' ')}</Badge>
                  </div>
                  {ev.at ? <p className="text-xs text-muted-foreground">{new Date(ev.at).toLocaleString('en-IN')}</p> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
