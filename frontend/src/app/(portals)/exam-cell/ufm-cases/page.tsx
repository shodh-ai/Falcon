'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type UfmCase = {
  case_id: string;
  student_name: string;
  description: string;
  penalty_applied: string;
  status: string;
  marks_locked: boolean;
  exam_type?: string;
  logged_at: string;
};

export default function ExamCellUfmPage() {
  const api = useAuthedApi();
  const [cases, setCases] = useState<UfmCase[]>([]);
  const [form, setForm] = useState({
    student_user_id: '',
    description: '',
    penalty_applied: 'Exam cancelled — UFM',
    course_id: '',
  });

  const load = useCallback(() => {
    void api.get<UfmCase[]>('/api/exam-cell/ufm-cases').then(setCases);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function logCase() {
    try {
      await api.post('/api/exam-cell/ufm-cases', form);
      toast.success('UFM logged — marks zeroed & transcripts locked');
      setForm({ student_user_id: '', description: '', penalty_applied: 'Exam cancelled — UFM', course_id: '' });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">UFM Malpractice Desk</h1>
        <p className="text-sm text-muted-foreground">Logging a case instantly zeros marks and withholds grade cards.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Log new UFM case</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Student user ID (UUID)" value={form.student_user_id} onChange={(e) => setForm((f) => ({ ...f, student_user_id: e.target.value }))} />
          <Input placeholder="Course ID (optional, UUID)" value={form.course_id} onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))} />
          <textarea
            className="min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Incident description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input placeholder="Penalty" value={form.penalty_applied} onChange={(e) => setForm((f) => ({ ...f, penalty_applied: e.target.value }))} />
          <Button onClick={() => void logCase()}>Log UFM & lock results</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {cases.map((c) => (
          <div key={c.case_id} className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-bold text-red-900">{c.student_name ?? 'Student'}</p>
              <Badge variant="destructive">{c.status}</Badge>
            </div>
            <p className="mt-1">{c.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.penalty_applied} · {c.marks_locked ? 'Marks locked' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
