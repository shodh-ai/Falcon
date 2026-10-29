'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type AuditResult = {
  final_status: string;
  credits_earned: number | null;
  credits_required?: number | null;
  cgpa_earned: number | null;
  cgpa_required?: number | null;
  pending_backlogs: number | null;
  finance_clearance: boolean;
  examination_clearance: boolean;
  library_clearance?: boolean;
  hostel_clearance?: boolean;
  clearance_statuses?: Partial<Record<'credits' | 'cgpa' | 'backlogs' | 'finance' | 'examination' | 'library' | 'hostel', string>>;
  requirements_policy_status?: 'UNCONFIRMED' | 'CONFIRMED';
};

type CheckStatus = 'CLEARED' | 'NOT_CLEARED' | 'UNAVAILABLE';

function checkLabel(status?: string) {
  if (status === 'CLEARED') return 'Cleared';
  if (status === 'NOT_CLEARED') return 'Not cleared';
  return 'Not verified';
}

export default function ExamCellDegreeAuditPage() {
  const api = useAuthedApi();
  const [studentId, setStudentId] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runAudit() {
    if (!studentId.trim()) {
      toast.error('Enter student user ID');
      return;
    }
    setLoading(true);
    try {
      setResult(await api.post<AuditResult>(`/api/exam-cell/degree-audit/${studentId.trim()}`, {}));
      toast.success('Degree eligibility audit complete');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Audit failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const checks = result ? [
    {
      label: 'Credits earned',
      status: result.requirements_policy_status === 'CONFIRMED'
        ? (result.clearance_statuses?.credits as CheckStatus | undefined) ?? 'UNAVAILABLE'
        : 'UNAVAILABLE',
      detail: `${result.credits_earned ?? '—'} / ${result.credits_required ?? '—'} configured; policy unconfirmed`,
    },
    {
      label: 'CGPA requirement',
      status: result.requirements_policy_status === 'CONFIRMED'
        ? (result.clearance_statuses?.cgpa as CheckStatus | undefined) ?? 'UNAVAILABLE'
        : 'UNAVAILABLE',
      detail: `${result.cgpa_earned?.toFixed(2) ?? '—'} / ${result.cgpa_required ?? '—'} configured; policy unconfirmed`,
    },
    {
      label: 'No pending backlogs',
      status: (result.clearance_statuses?.backlogs as CheckStatus | undefined) ?? 'UNAVAILABLE',
      detail: result.pending_backlogs == null ? 'Not verified' : `${result.pending_backlogs} pending`,
    },
    {
      label: 'Finance clearance',
      status: (result.clearance_statuses?.finance as CheckStatus | undefined) ?? 'UNAVAILABLE',
      detail: checkLabel(result.clearance_statuses?.finance),
    },
    {
      label: 'Examination clearance',
      status: (result.clearance_statuses?.backlogs as CheckStatus | undefined) ?? 'UNAVAILABLE',
      detail: checkLabel(result.clearance_statuses?.backlogs),
    },
    {
      label: 'Library clearance',
      status: (result.clearance_statuses?.library as CheckStatus | undefined) ?? 'UNAVAILABLE',
      detail: checkLabel(result.clearance_statuses?.library),
    },
    {
      label: 'Hostel clearance',
      status: (result.clearance_statuses?.hostel as CheckStatus | undefined) ?? 'UNAVAILABLE',
      detail: checkLabel(result.clearance_statuses?.hostel),
    },
  ] : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="degree-audit" />
        </CardContent>
      </Card>
      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="space-y-2 py-3 text-sm">
          <p><strong>How to run an audit:</strong></p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Use <Link href="/exam-cell/search" className="font-medium text-sgvu-navy underline">Global Search</Link> to find the student and copy their user ID.</li>
            <li>Paste the UUID below and click Run audit.</li>
            <li>Falcon checks credits, CGPA, backlogs, finance, library, hostel, and examination clearance.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex gap-2 pt-6">
          <Input placeholder="Student user ID (UUID) or search from Global Search first" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          <Button onClick={() => void runAudit()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Eligibility result
              <Badge variant={result.final_status === 'ELIGIBLE' ? 'default' : result.final_status === 'NOT_ELIGIBLE' ? 'destructive' : 'outline'}>{result.final_status.replace(/_/g, ' ')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span>{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{c.detail}</span>
                  <Badge variant={c.status === 'CLEARED' ? 'default' : c.status === 'NOT_CLEARED' ? 'destructive' : 'outline'}>{checkLabel(c.status)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
