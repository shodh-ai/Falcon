'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function GradeChangePage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [fromG, setFromG] = useState('C');
  const [toG, setToG] = useState('B');
  const [course, setCourse] = useState('CSE401');

  const reload = () =>
    api.get<any[]>('/api/uos/sis/grade-changes').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    void reload();
  }, [api]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">SIS — Grade Change DOFA</h1>
      <p className="text-sm text-muted-foreground">
        Faculty → HOD → Dean Academics → COE apply. Maker cannot self-approve.
      </p>
      <div className="grid max-w-xl gap-2">
        <Input placeholder="Student user_id" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        <Input placeholder="Course code" value={course} onChange={(e) => setCourse(e.target.value)} />
        <div className="flex gap-2">
          <Input value={fromG} onChange={(e) => setFromG(e.target.value)} />
          <Input value={toG} onChange={(e) => setToG(e.target.value)} />
        </div>
        <Button
          onClick={() =>
            api
              .post('/api/uos/sis/grade-changes', {
                student_user_id: studentId,
                course_code: course,
                from_grade: fromG,
                to_grade: toG,
                reason: 'Post-final correction after recheck',
              })
              .then(() => {
                toast.success('Submitted to HOD');
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          Request grade change
        </Button>
      </div>
      {rows.map((r) => (
        <div key={r.change_id} className="flex gap-2 border-b py-2 text-sm items-center">
          <span>
            {r.course_code}: {r.from_grade}→{r.to_grade} · {r.status}
          </span>
          <Button
            size="sm"
            onClick={() =>
              api
                .post(`/api/uos/sis/grade-changes/${r.change_id}/advance`)
                .then(() => reload())
                .catch((e) => toast.error(String(e?.message ?? e)))
            }
          >
            Advance
          </Button>
        </div>
      ))}
    </div>
  );
}
