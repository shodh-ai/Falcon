'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Clock } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type Deadline = {
  deadline_id: string;
  title: string;
  deadline_type: string;
  due_at: string;
  days_remaining: number;
  semester: number | null;
};

const DEADLINE_TYPES = [
  'EXAM_REGISTRATION', 'FEE_PAYMENT', 'HALL_TICKET_RELEASE',
  'INTERNAL_MARKS', 'RESULT_DECLARATION', 'REVALUATION', 'SUPPLEMENTARY_REGISTRATION', 'OTHER',
];

export default function ExamCellDeadlinesPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'manage_schedules');
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{ api: typeof api | null; revision: number; rows: Deadline[]; error: string | null }>({ api: null, revision: -1, rows: [], error: null });
  const loading = resource.api !== api || resource.revision !== revision;
  const rows = loading ? [] : resource.rows;
  const error = loading ? null : resource.error;
  const [creating, setCreating] = useState(false);
  const createPending = useRef(false);
  const [form, setForm] = useState({ title: '', deadline_type: 'EXAM_REGISTRATION', due_at: '', semester: '4' });

  useEffect(() => {
    let cancelled = false;
    api.get<Deadline[]>('/api/exam-cell/deadlines').then(
      (data) => { if (!cancelled) setResource({ api, revision, rows: data, error: null }); },
      (cause) => { if (!cancelled) setResource({ api, revision, rows: [], error: cause instanceof Error ? cause.message : 'Failed to load deadlines' }); },
    );
    return () => { cancelled = true; };
  }, [api, revision]);

  async function createDeadline() {
    if (!canManage || createPending.current) return;
    if (!form.title.trim() || !form.due_at) {
      toast.error('Title and due date required');
      return;
    }
    createPending.current = true;
    setCreating(true);
    try {
      await api.post('/api/exam-cell/deadlines', {
        ...form, title: form.title.trim(),
        semester: Number(form.semester),
      });
      toast.success('Deadline created');
      setForm((f) => ({ ...f, title: '' }));
      setRevision((value) => value + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      createPending.current = false;
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="deadlines" />
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="py-3 text-sm">
          Deadlines appear on the Examination Calendar and Command Center countdown widgets. They do not auto-send SMS/email — use Exam Notifications for broadcast alerts.
        </CardContent>
      </Card>

      {canManage && <Card>
        <CardHeader><CardTitle className="text-base">Add deadline</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="deadline-title" className="sr-only">Title</label>
          <Input id="deadline-title" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="sm:col-span-2" />
          <label htmlFor="deadline-type" className="sr-only">Deadline type</label>
          <Select id="deadline-type" className="rounded-md border px-3 py-2 text-sm" value={form.deadline_type} onChange={(e) => setForm((f) => ({ ...f, deadline_type: e.target.value }))}>
            {DEADLINE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
          <label htmlFor="deadline-due-at" className="sr-only">Due at</label>
          <Input id="deadline-due-at" type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} />
          <Button disabled={creating} onClick={() => void createDeadline()} className="sm:col-span-2"><Plus className="mr-2 h-4 w-4" />{creating ? 'Adding deadline…' : 'Add deadline'}</Button>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader><CardTitle className="text-base">Active deadlines</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <Loader2 aria-label="Loading deadlines" className="h-6 w-6 animate-spin" /> : error ? (
            <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active deadlines configured.</p>
          ) : rows.map((d) => (
            <div key={d.deadline_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">{d.deadline_type.replace(/_/g, ' ')} · Due {new Date(d.due_at).toLocaleString('en-IN')}</p>
              </div>
              <Badge variant={d.days_remaining < 3 ? 'destructive' : 'outline'}>
                <Clock className="mr-1 h-3 w-3" />
                {Math.ceil(Number(d.days_remaining))} days left
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
