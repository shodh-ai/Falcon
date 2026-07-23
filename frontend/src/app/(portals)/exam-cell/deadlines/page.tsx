'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Clock } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

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
  const [rows, setRows] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', deadline_type: 'EXAM_REGISTRATION', due_at: '', semester: '4' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Deadline[]>('/api/exam-cell/deadlines'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load deadlines');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function createDeadline() {
    if (!form.title || !form.due_at) {
      toast.error('Title and due date required');
      return;
    }
    try {
      await api.post('/api/exam-cell/deadlines', {
        ...form,
        semester: Number(form.semester),
      });
      toast.success('Deadline created');
      setForm((f) => ({ ...f, title: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
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

      <Card>
        <CardHeader><CardTitle className="text-base">Add deadline</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="sm:col-span-2" />
          <Select className="rounded-md border px-3 py-2 text-sm" value={form.deadline_type} onChange={(e) => setForm((f) => ({ ...f, deadline_type: e.target.value }))}>
            {DEADLINE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
          <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} />
          <Button onClick={() => void createDeadline()} className="sm:col-span-2"><Plus className="mr-2 h-4 w-4" />Add deadline</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Active deadlines</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : rows.length === 0 ? (
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
