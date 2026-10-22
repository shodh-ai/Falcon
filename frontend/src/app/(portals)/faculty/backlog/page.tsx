'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';

type Attempt = { attempt_id: string; student_name: string; course_code: string; course_name: string; semester: number; attempt_number: number; source_exam_type: string; status: string; marks_status: string; marks_obtained: string | number | null; max_marks: string | number };
type Result = { api: ReturnType<typeof useAuthedApi>; revision: number; rows: Attempt[]; error: string | null };

export default function FacultyBacklogPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const roles = [...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''].map((role) => role.trim().toLowerCase());
  const canMark = roles.some((role) => ['faculty', 'hod'].includes(role));
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [drafts, setDrafts] = useState<{ api: typeof api; values: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);
  const scope = useRef(0);
  const current = result?.api === api && result.revision === revision ? result : null;
  const rows = current?.rows ?? [];
  const loading = !current;
  const error = current?.error;
  const values = drafts?.api === api ? drafts.values : {};

  useEffect(() => {
    let active = true;
    void api.get<Attempt[]>('/api/academics/faculty/backlog').then((data) => {
      if (!Array.isArray(data)) throw new Error('The server did not return assigned retakes');
      if (active) setResult({ api, revision, rows: data, error: null });
    }).catch((e: unknown) => {
      if (active) setResult({ api, revision, rows: [], error: e instanceof Error ? e.message : 'Could not load retake assignments' });
    });
    return () => { active = false; scope.current += 1; };
  }, [api, revision]);

  async function act(row: Attempt, action: 'marks' | 'submit') {
    if (pending.current || loading || error || !canMark || row.status !== 'APPROVED' || row.marks_status !== 'DRAFT') return;
    const raw = values[row.attempt_id] ?? (row.marks_obtained == null ? '' : String(row.marks_obtained));
    const marks = Number(raw);
    const maximum = Number(row.max_marks);
    if (!raw.trim() || !Number.isFinite(marks) || !Number.isFinite(maximum) || maximum <= 0 || marks < 0 || marks > maximum || Math.abs(marks * 100 - Math.round(marks * 100)) > 1e-7) {
      toast.error('Enter marks between zero and the configured maximum, with at most two decimal places'); return;
    }
    if (action === 'submit' && (row.marks_obtained == null || marks !== Number(row.marks_obtained))) {
      toast.error('Save the edited marks before submitting'); return;
    }
    pending.current = true;
    setBusy(`${action}:${row.attempt_id}`);
    const generation = scope.current;
    try {
      await api.post(`/api/academics/faculty/backlog/attempts/${row.attempt_id}/${action}`, action === 'marks' ? { marks_obtained: marks } : {});
      if (generation !== scope.current) return;
      toast.success(action === 'marks' ? 'Retake marks saved' : 'Retake marks submitted for Examination Cell review');
      setDrafts((previous) => {
        const next = previous?.api === api ? { ...previous.values } : {};
        delete next[row.attempt_id];
        return { api, values: next };
      });
      setRevision((value) => value + 1);
    } catch (e) {
      if (generation === scope.current) toast.error(e instanceof Error ? e.message : 'Could not save retake marks');
    } finally { pending.current = false; setBusy(null); }
  }

  return <FacultyPageShell>
    <FacultyPageHeader title="Backlog & Supplementary Marks" description="Enter marks only for approved retakes assigned to you. Submit saved marks for Examination Cell and Dean review." actions={<Button asChild variant="outline"><Link href="/faculty/re-evaluations">Re-evaluation cases</Link></Button>} />
    <Card><CardHeader><CardTitle className="text-base">Assigned retakes</CardTitle></CardHeader><CardContent className="space-y-4">
      {!canMark && <p className="text-sm text-muted-foreground">This workspace requires an assigned Faculty or HOD role.</p>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading assigned retakes…</p> : error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry assigned retakes</Button></div> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No retake assignments available.</p> : rows.map((row) => {
        const editable = canMark && row.status === 'APPROVED' && row.marks_status === 'DRAFT';
        return <section key={row.attempt_id} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold text-sgvu-navy">{row.student_name}</h2><p className="text-sm text-muted-foreground">{row.course_code} · {row.course_name} · Semester {row.semester} · Attempt {row.attempt_number}</p></div><Badge variant="outline">{row.marks_status}</Badge></div>
          {editable ? <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><label htmlFor={`retake-marks-${row.attempt_id}`} className="text-sm font-medium">Marks for {row.student_name} (maximum {row.max_marks})</label><Input id={`retake-marks-${row.attempt_id}`} type="number" min={0} max={Number(row.max_marks)} step="0.01" value={values[row.attempt_id] ?? (row.marks_obtained == null ? '' : String(row.marks_obtained))} disabled={busy !== null} onChange={(e) => setDrafts((previous) => ({ api, values: { ...(previous?.api === api ? previous.values : {}), [row.attempt_id]: e.target.value } }))} /></div>
            <Button disabled={busy !== null} onClick={() => void act(row, 'marks')}>{busy === `marks:${row.attempt_id}` ? 'Saving…' : 'Save marks'}</Button>
            <Button variant="outline" disabled={busy !== null || row.marks_obtained == null} onClick={() => void act(row, 'submit')}>{busy === `submit:${row.attempt_id}` ? 'Submitting…' : 'Submit for review'}</Button>
          </div> : <p className="text-sm text-muted-foreground">Saved marks: {row.marks_obtained ?? '—'}/{row.max_marks} · {row.status}</p>}
        </section>;
      })}
    </CardContent></Card>
  </FacultyPageShell>;
}
