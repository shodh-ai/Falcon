'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
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

const btnIdle =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
const btnBusy = 'h-10 border border-sgvu-gold bg-sgvu-gold px-5 text-sm font-semibold text-sgvu-navy';

export default function ExamCellTranscriptsPage() {
  const api = useAuthedApi();
  const [semester, setSemester] = useState('4');
  const [rows, setRows] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await api.post<Transcript[]>('/api/exam-cell/transcripts/generate', { semester: Number(semester) });
      setRows(res);
      const ready = res.filter((r) => r.digilocker_ready).length;
      toast.success(`Generated ${res.length} packages · ${ready} DigiLocker-ready`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const readyCount = rows.filter((r) => r.digilocker_ready).length;
  const missingAbc = rows.filter((r) => !r.digilocker_ready).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Degree & Transcript Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Students with open UFM cases are excluded. ABC ID enables DigiLocker push.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="space-y-2 py-3 text-sm">
          <p><strong>How it works:</strong></p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Enter the semester and click Generate — Falcon builds transcript packages from <strong>published</strong> exam results.</li>
            <li>Students with open UFM cases are skipped automatically.</li>
            <li>Rows marked DigiLocker-ready have a valid ABC ID on file for government transcript push.</li>
            <li>Packages are previewed here; PDF export and DigiLocker sync require backend file storage (Phase 2).</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Generate batch transcripts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Semester</label>
            <Input
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="h-10 w-32 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
              placeholder="4"
            />
          </div>
          <Button
            variant="outline"
            className={loading ? btnBusy : btnIdle}
            onClick={() => void generate()}
            disabled={loading}
          >
            {loading ? 'Generating…' : 'Generate transcripts'}
          </Button>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Choose a semester and click Generate to build transcript packages from published exam results.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{rows.length} generated</Badge>
            <Badge className="bg-emerald-100 text-emerald-800">{readyCount} DigiLocker-ready</Badge>
            {missingAbc > 0 ? (
              <Badge variant="secondary">{missingAbc} missing ABC ID</Badge>
            ) : null}
          </div>
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
        </>
      )}
    </div>
  );
}
