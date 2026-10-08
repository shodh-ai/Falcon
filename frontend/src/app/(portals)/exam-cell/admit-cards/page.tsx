'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';
import { buildExamBatchLabel, type ExamType } from '@/lib/exam-cell-batch';
import { formatStringList } from '@/lib/exam-cell/format';
import { cn } from '@/lib/utils';

type AuditRow = {
  student_user_id: string;
  student_id: string;
  name: string;
  semester: number;
  fee_status: 'Clear' | 'Pending';
  attendance_percent: number;
  has_exemption: boolean;
  eligible: boolean;
  block_reasons: string[];
};

type AuditResponse = {
  batch_label: string;
  semester: number;
  eligible_count: number;
  blocked_count: number;
  items: AuditRow[];
};

const ATTENDANCE_THRESHOLD = 75;

function exportDefaultersCsv(rows: AuditRow[], semester: string, examType: ExamType) {
  const blocked = rows.filter((r) => !r.eligible);
  const header = ['Student Name', 'Roll No', 'Fee Dues', 'Attendance %', 'Status', 'Block Reasons'];
  const lines = blocked.map((r) =>
    [
      r.name,
      r.student_id,
      r.fee_status === 'Clear' ? 'Paid' : 'Pending',
      r.attendance_percent,
      'Blocked',
      formatStringList(r.block_reasons, '; '),
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `admit-card-defaulters-sem${semester}-${examType.toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function FeeBadge({ status }: { status: 'Clear' | 'Pending' }) {
  return status === 'Pending' ? (
    <Badge variant="destructive" className="font-medium">Pending</Badge>
  ) : (
    <Badge className="bg-emerald-100 font-medium text-emerald-800 hover:bg-emerald-100">Paid</Badge>
  );
}

function StatusBadge({ eligible }: { eligible: boolean }) {
  return eligible ? (
    <Badge className="bg-emerald-600 font-semibold hover:bg-emerald-600">Eligible</Badge>
  ) : (
    <Badge variant="destructive" className="font-semibold">Blocked</Badge>
  );
}

export default function ExamCellAdmitCardsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canGenerate = canExamCellAction(user?.roles ?? user?.role, 'generate_admit_cards');

  const [semester, setSemester] = useState('4');
  const [examType, setExamType] = useState<ExamType>('END_TERM');
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const batchLabel = useMemo(
    () => buildExamBatchLabel(semester, examType),
    [semester, examType],
  );

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await api.get<AuditResponse>(
        `/api/exam-cell/admit-cards/audit?batch_label=${encodeURIComponent(batchLabel)}&semester=${semester}`,
      );
      setAudit(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Audit load failed');
      setAudit(null);
    } finally {
      setAuditLoading(false);
    }
  }, [api, batchLabel, semester]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const rows = audit?.items ?? [];
  const eligibleCount = audit?.eligible_count ?? 0;
  const blockedCount = audit?.blocked_count ?? 0;

  const runGenerate = useCallback(async () => {
    if (!eligibleCount) {
      toast.error('No eligible students in the audit matrix');
      return;
    }
    setGenerating(true);
    setProgress(0);
    try {
      const res = await api.post<{ generated: number; blocked: number }>('/api/exam-cell/admit-cards/generate', {
        batch_label: batchLabel,
        semester: Number(semester),
      });
      setProgress(100);
      toast.success(`Generated ${res.generated} admit cards · ${res.blocked} blocked`);
      await loadAudit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  }, [api, batchLabel, semester, eligibleCount, loadAudit]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="admit-cards" />
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-sgvu-navy">Audit filters</CardTitle>
          <CardDescription>Select semester and exam type before reviewing eligibility.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Semester</label>
            <Select className="h-10 w-full rounded-lg border px-3 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exam type</label>
            <Select className="h-10 w-full rounded-lg border px-3 text-sm" value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
              <option value="MID_TERM">Mid Term</option>
              <option value="END_TERM">End Term</option>
            </Select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button
              variant="outline"
              className="h-10 w-full border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
              onClick={() => void loadAudit()}
              disabled={auditLoading}
            >
              {auditLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 shadow-sm">
        <CardHeader className="border-b bg-slate-50/80">
          <CardTitle className="text-base text-sgvu-navy">Pre-generation audit matrix</CardTitle>
          <CardDescription>
            {auditLoading ? 'Loading…' : `${eligibleCount} eligible · ${blockedCount} blocked · Fee paid + attendance ≥ ${ATTENDANCE_THRESHOLD}%`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Student name</th>
                  <th className="px-4 py-3">Roll no.</th>
                  <th className="px-4 py-3">Fee dues</th>
                  <th className="px-4 py-3">Attendance %</th>
                  <th className="px-4 py-3">Final status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLoading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No enrolled students for this semester.</td></tr>
                ) : rows.map((student) => {
                  const lowAtt = student.attendance_percent < ATTENDANCE_THRESHOLD && !student.has_exemption;
                  return (
                    <tr key={student.student_user_id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 font-medium text-sgvu-navy">{student.name}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{student.student_id}</td>
                      <td className="px-4 py-3.5"><FeeBadge status={student.fee_status} /></td>
                      <td className="px-4 py-3.5"><span className={cn('font-medium tabular-nums', lowAtt && 'text-red-600')}>{student.attendance_percent}%</span></td>
                      <td className="px-4 py-3.5"><StatusBadge eligible={student.eligible} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {rows.map((student) => (
              <div key={student.student_user_id} className="rounded-xl border p-4">
                <div className="flex justify-between gap-2">
                  <div><p className="font-semibold">{student.name}</p><p className="font-mono text-xs text-muted-foreground">{student.student_id}</p></div>
                  <StatusBadge eligible={student.eligible} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-[10px] uppercase text-muted-foreground">Fee</p><FeeBadge status={student.fee_status} /></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Attendance</p><p className="font-semibold">{student.attendance_percent}%</p></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 shadow-sm">
        <CardContent className="space-y-4 pt-6">
          {generating ? (
            <div className="space-y-2 rounded-lg border border-sgvu-gold/30 bg-amber-50/40 p-4">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-sgvu-navy">Generating secure PDF batch…</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} indicatorClassName="bg-sgvu-navy" />
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canGenerate ? (
              <Button size="lg" className="h-11 bg-sgvu-navy hover:bg-sgvu-navy/90" onClick={() => void runGenerate()} disabled={generating || eligibleCount === 0}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Admit Cards for Eligible Students ({eligibleCount})
              </Button>
            ) : null}
            <Button asChild variant="outline" size="lg" className="h-11">
              <a href="/exam-cell/hall-ticket-approvals">Hall Ticket Approval Workflow →</a>
            </Button>
            <Button variant="ghost" size="lg" className="h-11" disabled={blockedCount === 0 || generating} onClick={() => exportDefaultersCsv(rows, semester, examType)}>
              <Download className="mr-2 h-4 w-4" />
              Export Defaulter List
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
