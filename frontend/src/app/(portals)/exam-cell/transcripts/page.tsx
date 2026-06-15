'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Transcript = {
  student_user_id: string;
  name: string;
  enrollment_number: string;
  abc_id: string | null;
  digilocker_ready: boolean;
  status: string;
};

export default function ExamCellTranscriptsPage() {
  const api = useAuthedApi();
  const [semester, setSemester] = useState('8');
  const [rows, setRows] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await api.post<Transcript[]>('/api/exam-cell/transcripts/generate', { semester: Number(semester) });
      setRows(res);
      toast.success(`Generated ${res.length} transcript packages`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Degree & Transcript Generator</h1>
        <p className="text-sm text-muted-foreground">Students with open UFM cases are excluded. ABC ID enables DigiLocker push.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Generate graduating batch</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <Input value={semester} onChange={(e) => setSemester(e.target.value)} className="w-32" placeholder="Semester" />
          <Button onClick={() => void generate()} disabled={loading}>{loading ? 'Generating…' : '1-click generate'}</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.student_user_id} className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm">
            <div>
              <p className="font-semibold">{r.name}</p>
              <p className="text-muted-foreground">{r.enrollment_number ?? '—'}</p>
            </div>
            <Badge variant={r.digilocker_ready ? 'default' : 'secondary'}>
              {r.digilocker_ready ? `ABC ${r.abc_id}` : 'ABC ID missing'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
