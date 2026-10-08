'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, FileCheck2, Medal } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { useAuth } from '@/context/AuthContext';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

const btnBase =
  'h-10 border px-5 text-sm font-semibold transition-colors disabled:opacity-60';
const btnIdle =
  'border-[#0B2447] bg-[#0B2447] text-white hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';
const btnBusy =
  'border-sgvu-gold bg-sgvu-gold text-sgvu-navy';

type BusyKey = 'refresh' | 'generate' | 'publish-provisional' | 'finalize' | `pdf:${string}` | null;

function actionBtnClass(busyKey: BusyKey, key: NonNullable<BusyKey>) {
  return `${btnBase} ${busyKey === key ? btnBusy : btnIdle}`;
}

type GradeCardPayload = {
  result_stage?: 'DRAFT' | 'PROVISIONAL' | 'FINAL';
  sgpa?: number;
  cgpa?: number;
  rank?: number | null;
  credits_attempted?: number;
  credits_earned?: number;
  formula?: string;
  withheld_reason?: string;
};

type GradeCardRow = {
  grade_card_id: string;
  student_user_id: string;
  semester: number;
  cgpa: string | number | null;
  status: 'DRAFT' | 'PUBLISHED' | 'WITHHELD';
  published_at: string | null;
  payload: GradeCardPayload | null;
  student_name: string;
  student_email: string;
  enrollment_number: string | null;
};

type TopStudent = {
  student_user_id: string;
  student_name: string;
  enrollment_number: string | null;
  rank: number;
  sgpa: string | number;
  cgpa: string | number;
  result_stage: string;
};

function stageBadge(row: GradeCardRow) {
  if (row.status === 'WITHHELD') return <Badge variant="destructive">Withheld</Badge>;
  if (row.payload?.result_stage === 'FINAL') return <Badge variant="success">Final</Badge>;
  if (row.payload?.result_stage === 'PROVISIONAL') return <Badge variant="warning">Provisional</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

export default function ExamCellGradeCardsPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [semester, setSemester] = useState('4');
  const [rows, setRows] = useState<GradeCardRow[]>([]);
  const [topStudents, setTopStudents] = useState<TopStudent[]>([]);
  const [busyKey, setBusyKey] = useState<BusyKey>(null);

  const load = useCallback(async () => {
    const sem = Number(semester);
    if (!Number.isFinite(sem) || sem < 1) return;
    try {
      const [cards, toppers] = await Promise.all([
        api.get<GradeCardRow[]>(`/api/exam-cell/grade-cards?semester=${sem}`),
        api.get<TopStudent[]>(`/api/exam-cell/grade-cards/top-students?semester=${sem}&limit=10`),
      ]);
      setRows(cards);
      setTopStudents(toppers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load grade cards');
      setRows([]);
      setTopStudents([]);
    }
  }, [api, semester]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusyKey('refresh');
    try {
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function runAction(action: 'generate' | 'publish-provisional' | 'finalize') {
    const sem = Number(semester);
    if (!Number.isFinite(sem) || sem < 1) {
      toast.error('Enter a valid semester');
      return;
    }
    setBusyKey(action);
    try {
      const path =
        action === 'generate'
          ? '/api/exam-cell/grade-cards/generate'
          : `/api/exam-cell/grade-cards/${action}`;
      const result = await api.post<{ generated_count?: number; updated_count?: number }>(path, { semester: sem });
      const count = result.generated_count ?? result.updated_count ?? 0;
      toast.success(`${count} grade cards ${action === 'generate' ? 'generated' : 'updated'}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyKey(null);
    }
  }

  async function downloadPdf(gradeCardId: string) {
    if (!token) {
      toast.error('Sign in again to download PDFs');
      return;
    }
    const key = `pdf:${gradeCardId}` as const;
    setBusyKey(key);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/exam-cell/grade-cards/${gradeCardId}/export/pdf`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        },
      );
      if (!res.ok) throw new Error('PDF export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `grade-card-${gradeCardId.slice(0, 8)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Grade card PDF downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setBusyKey(null);
    }
  }

  const summary = useMemo(() => {
    const final = rows.filter((r) => r.payload?.result_stage === 'FINAL').length;
    const provisional = rows.filter((r) => r.payload?.result_stage === 'PROVISIONAL').length;
    const withheld = rows.filter((r) => r.status === 'WITHHELD').length;
    return { final, provisional, withheld, total: rows.length };
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader
            pageId="grade-cards"
            actions={
              <>
                <Input
                  className="w-28"
                  type="number"
                  min={1}
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="Semester"
                />
                <Button
                  variant="outline"
                  className={actionBtnClass(busyKey, 'refresh')}
                  onClick={() => void refresh()}
                  disabled={busyKey === 'refresh'}
                >
                  Refresh
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<FileCheck2 className="size-5" />} label="Grade cards" value={summary.total} />
        <MetricCard icon={<Award className="size-5" />} label="Provisional" value={summary.provisional} />
        <MetricCard icon={<Award className="size-5" />} label="Final" value={summary.final} />
        <MetricCard icon={<Medal className="size-5" />} label="Withheld" value={summary.withheld} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semester result workflow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className={actionBtnClass(busyKey, 'generate')}
            onClick={() => void runAction('generate')}
            disabled={busyKey === 'generate'}
          >
            Generate provisional batch
          </Button>
          <Button
            variant="outline"
            className={actionBtnClass(busyKey, 'publish-provisional')}
            onClick={() => void runAction('publish-provisional')}
            disabled={busyKey === 'publish-provisional' || rows.length === 0}
          >
            Publish provisional
          </Button>
          <Button
            variant="outline"
            className={actionBtnClass(busyKey, 'finalize')}
            onClick={() => void runAction('finalize')}
            disabled={busyKey === 'finalize' || rows.length === 0}
          >
            Finalize marksheets
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Formula used: SGPA/CGPA = Σ(credits × grade points) / Σ(attempted credits). Withheld students are excluded from ranking.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student grade cards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">SGPA</th>
                    <th className="px-3 py-2">CGPA</th>
                    <th className="px-3 py-2">Credits</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                        No grade cards yet. Generate a provisional batch for this semester.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.grade_card_id} className="border-t">
                        <td className="px-3 py-2 font-semibold">{row.payload?.rank ?? '—'}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.student_name}</p>
                          <p className="text-xs text-muted-foreground">{row.enrollment_number ?? row.student_email}</p>
                          {row.payload?.withheld_reason && (
                            <p className="text-xs text-destructive">{row.payload.withheld_reason}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{Number(row.payload?.sgpa ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums">{Number(row.payload?.cgpa ?? row.cgpa ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.payload?.credits_earned ?? 0}/{row.payload?.credits_attempted ?? 0}
                        </td>
                        <td className="px-3 py-2">{stageBadge(row)}</td>
                        <td className="px-3 py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className={actionBtnClass(busyKey, `pdf:${row.grade_card_id}`)}
                            aria-label={`Download grade card PDF for ${row.student_name}`}
                            onClick={() => void downloadPdf(row.grade_card_id)}
                            disabled={busyKey === `pdf:${row.grade_card_id}`}
                          >
                            PDF
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top students</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Generate grade cards to calculate the merit list.</p>
            ) : (
              topStudents.map((student) => (
                <div key={student.student_user_id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">#{student.rank} {student.student_name}</p>
                      <p className="text-xs text-muted-foreground">{student.enrollment_number ?? '—'}</p>
                    </div>
                    <Badge variant="outline">{student.result_stage}</Badge>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                      SGPA {Number(student.sgpa).toFixed(2)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                      CGPA {Number(student.cgpa).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-xl bg-sgvu-navy/10 p-2 text-sgvu-navy">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-sgvu-navy">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
