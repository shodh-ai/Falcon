'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type AdmitRun = {
  run_id: string;
  batch_label: string;
  semester: number;
  generated_count: number;
  blocked_count: number;
  created_at: string;
};

type GenerateResult = {
  run_id: string;
  generated: number;
  blocked: number;
  students: { student_user_id: string; name: string; eligible: boolean; reasons: string[] }[];
};

export default function ExamCellAdmitCardsPage() {
  const api = useAuthedApi();
  const [batchLabel, setBatchLabel] = useState('B.Tech Sem 4');
  const [semester, setSemester] = useState('4');
  const [runs, setRuns] = useState<AdmitRun[]>([]);
  const [lastResult, setLastResult] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    void api.get<AdmitRun[]>('/api/exam-cell/admit-cards/runs').then(setRuns);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setLoading(true);
    try {
      const res = await api.post<GenerateResult>('/api/exam-cell/admit-cards/generate', {
        batch_label: batchLabel,
        semester: Number(semester),
      });
      setLastResult(res);
      toast.success(`Generated ${res.generated} admit cards · ${res.blocked} blocked`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Admit Card Engine</h1>
        <p className="text-sm text-muted-foreground">
          Auto-checks fee dues, attendance (&lt;75%), and hostel fines before printing hall tickets with barcodes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate batch admit cards</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Batch label</label>
            <Input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} className="mt-1 w-48" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Semester</label>
            <Input value={semester} onChange={(e) => setSemester(e.target.value)} className="mt-1 w-24" type="number" />
          </div>
          <Button onClick={() => void generate()} disabled={loading}>
            {loading ? 'Generating…' : 'Generate admit cards'}
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last run — {lastResult.generated} eligible · {lastResult.blocked} blocked</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-y-auto">
            {lastResult.students.map((s) => (
              <div key={s.student_user_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{s.name}</span>
                {s.eligible ? (
                  <Badge className="bg-emerald-100 text-emerald-800">PDF generated</Badge>
                ) : (
                  <span className="text-xs text-red-600">{s.reasons.join(' · ')}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.map((r) => (
            <div key={r.run_id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{r.batch_label} · Sem {r.semester}</span>
              <span className="text-muted-foreground">
                {r.generated_count} OK / {r.blocked_count} blocked · {new Date(r.created_at).toLocaleDateString('en-IN')}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
