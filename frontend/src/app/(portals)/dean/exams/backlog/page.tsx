'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';

type Attempt = { attempt_id: string; student_name: string; course_code: string; course_name: string; semester: number; attempt_number: number; status: string; marks_status: string; marks_obtained: string | number | null; max_marks: string | number };
type Result = { api: ReturnType<typeof useAuthedApi>; revision: number; rows: Attempt[]; error: string | null };

export default function DeanBacklogPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canApprove = [...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''].some((role) => ['dean', 'hod', 'superadmin'].includes(role.trim().toLowerCase()));
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);
  const scope = useRef(0);
  const current = result?.api === api && result.revision === revision ? result : null;
  const loading = !current;
  const error = current?.error;
  const rows = current?.rows ?? [];
  useEffect(() => {
    let active = true;
    void api.get<Attempt[]>('/api/exam-cell/backlog/dean/attempts').then((data) => {
      if (!Array.isArray(data)) throw new Error('The server did not return retake approval records');
      if (active) setResult({ api, revision, rows: data, error: null });
    }).catch((e: unknown) => {
      if (active) setResult({ api, revision, rows: [], error: e instanceof Error ? e.message : 'Could not load retake approvals' });
    });
    return () => { active = false; scope.current += 1; };
  }, [api, revision]);
  async function approve(row: Attempt) {
    if (pending.current || !canApprove || loading || error || row.marks_status !== 'COE_APPROVED') return;
    pending.current = true; setBusy(row.attempt_id); const generation = scope.current;
    try {
      await api.post(`/api/exam-cell/backlog/attempts/${row.attempt_id}/dean-approval`, {});
      if (generation !== scope.current) return;
      toast.success('Retake result approved for Examination Cell publication'); setRevision((value) => value + 1);
    } catch (e) {
      if (generation === scope.current) toast.error(e instanceof Error ? e.message : 'Could not approve retake result');
    } finally { pending.current = false; setBusy(null); }
  }
  const columns: DataTableColumn<Attempt>[] = [
    { key: 'student', header: 'Student', render: (row) => row.student_name },
    { key: 'course', header: 'Course', render: (row) => <div><p>{row.course_code} · {row.course_name}</p><p className="text-xs text-muted-foreground">Semester {row.semester} · Attempt {row.attempt_number}</p></div> },
    { key: 'marks', header: 'Marks', render: (row) => `${row.marks_obtained ?? '—'}/${row.max_marks}` },
    { key: 'status', header: 'Review status', render: (row) => <Badge variant="outline">{row.marks_status}</Badge> },
    { key: 'action', header: 'Action', render: (row) => canApprove && row.marks_status === 'COE_APPROVED' ? <Button size="sm" disabled={busy !== null} onClick={() => void approve(row)} aria-label={`Approve retake result for ${row.student_name}`}>{busy === row.attempt_id ? 'Approving…' : 'Approve result'}</Button> : '—' },
  ];
  return <HodPageFrame>
    <HodPageHeader title="Retake Result Approvals" description="Review Examination Cell approved backlog and supplementary marks within your academic scope. Publication remains with the Examination Cell." workspaceLabel="Dean Workspace" />
    <Button asChild variant="outline"><Link href="/dean/academics/result-analytics">Result analytics</Link></Button>
    <Card><CardHeader><CardTitle className="text-base">Pending academic approval</CardTitle></CardHeader><CardContent>
      {!canApprove && <p className="mb-3 text-sm text-muted-foreground">A Dean, HOD or SuperAdmin role is required to approve retake results.</p>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading retake approvals…</p> : error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry retake approvals</Button></div> : <DataTable columns={columns} rows={rows} rowKey={(row) => row.attempt_id} emptyMessage="No retake results pending your approval." />}
    </CardContent></Card>
  </HodPageFrame>;
}
