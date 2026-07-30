'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/notifications/falcon-toast';

function gradeStatusLabel(row: {
  status?: string;
  dofa_awaiting_role?: string | null;
  dofa_status?: string | null;
}) {
  if (row.status === 'APPLIED') return 'Applied';
  if (row.status === 'REJECTED') return 'Rejected';
  if (row.status === 'AWAITING_COE') return 'Awaiting Exam Cell (COE)';
  if (row.dofa_awaiting_role) {
    return `Awaiting ${row.dofa_awaiting_role}`;
  }
  if (row.status === 'PENDING_DOFA') return 'Awaiting HOD';
  return row.status ?? 'Unknown';
}

export default function GradeChangePage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [fromG, setFromG] = useState('C');
  const [toG, setToG] = useState('B');
  const [course, setCourse] = useState('CSE401');
  const [reason, setReason] = useState('Post-final correction after recheck');
  const [submitting, setSubmitting] = useState(false);

  const reload = () =>
    api.get<any[]>('/api/uos/sis/grade-changes').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    void reload();
  }, [api]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">SIS — Grade Change DOFA</h1>
      <p className="text-sm text-muted-foreground">
        Faculty submits → HOD approves → Exam Cell (COE) applies. You cannot approve your own
        request.
      </p>
      <div className="grid max-w-xl gap-2">
        <Input placeholder="Student user_id" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        <Input placeholder="Course code" value={course} onChange={(e) => setCourse(e.target.value)} />
        <div className="flex gap-2">
          <Input placeholder="From grade" value={fromG} onChange={(e) => setFromG(e.target.value)} />
          <Input placeholder="To grade" value={toG} onChange={(e) => setToG(e.target.value)} />
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-sgvu-navy">Reason for change</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Post-final correction after recheck — explain why the grade must change"
            rows={3}
          />
        </label>
        <Button
          disabled={submitting}
          onClick={() => {
            if (!studentId.trim()) {
              toast.error('Enter the student user_id');
              return;
            }
            if (!reason.trim()) {
              toast.error('Enter a reason for the grade change');
              return;
            }
            setSubmitting(true);
            return api
              .post('/api/uos/sis/grade-changes', {
                student_user_id: studentId.trim(),
                course_code: course,
                from_grade: fromG,
                to_grade: toG,
                reason: reason.trim(),
              })
              .then(() => {
                toast.success('Submitted — awaiting HOD approval');
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
              .finally(() => setSubmitting(false));
          }}
        >
          Request grade change
        </Button>
      </div>
      <section>
        <h2 className="font-semibold mb-2 text-sm">Your requests</h2>
        {!rows.length && (
          <p className="text-sm text-muted-foreground">No grade change requests yet.</p>
        )}
        {rows.map((r) => (
          <div key={r.change_id} className="border-b py-2 text-sm">
            <div className="font-medium">
              {r.course_code}: {r.from_grade}→{r.to_grade}
            </div>
            <div className="text-muted-foreground">
              {gradeStatusLabel(r)}
              {r.student_name ? ` · ${r.student_name}` : ''}
            </div>
            {r.reason ? <div className="text-xs mt-0.5">{r.reason}</div> : null}
          </div>
        ))}
      </section>
    </div>
  );
}
