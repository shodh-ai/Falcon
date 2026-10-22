'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { toast } from '@/lib/notifications/falcon-toast';

type Source = { source_report_id: string; course_id: string; source_exam_type: string; semester: number; course_code: string; course_name: string; marks_obtained: string | number; max_marks: string | number };
type Offering = { offering_id: string; course_id: string; source_exam_type: string; semester: number; course_code: string; fee_mode: string; fee_amount: number | string; selection_policy: string; attempt_limit: number; closes_at: string; opens_at: string; session_name: string; exam_date: string };
type Attempt = { attempt_id: string; course_code: string; status: string; fee_status: string; finance_demand_id: string | null; marks_obtained: number | null; max_marks: string | number; result_status: string | null; grade: string | null; attempt_number: number; review_reason: string | null };
type Data = { offerings: Offering[]; failed_results: Source[]; applications: Attempt[] };

function displayDate(value: string | undefined, withTime = false) {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return withTime ? new Date(value).toLocaleString('en-IN') : new Date(value).toLocaleDateString('en-IN');
}

export default function StudentBacklogPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offeringId, setOfferingId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError(null);
    try { const result = await api.get<Data>('/api/academics/exams/backlog/options'); if (current === generation.current) setData(result); }
    catch (e) { if (current === generation.current) { setData(null); setError(e instanceof Error ? e.message : 'Could not load supplementary examinations'); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [api]);
  useEffect(() => { void Promise.resolve().then(load); return () => { generation.current += 1; }; }, [load]);
  const offering = data?.offerings.find(row => row.offering_id === offeringId);
  const sources = data?.failed_results.filter(row => offering && row.course_id === offering.course_id && row.semester === offering.semester && row.source_exam_type === offering.source_exam_type) ?? [];
  async function action(path: string, body: object, success: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await api.post(path, body); toast.success(success); setSourceId(''); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Supplementary examination action failed'); }
    finally { pending.current = false; setBusy(false); }
  }
  const columns: DataTableColumn<Attempt>[] = [
    { key: 'course', header: 'Course / retake', render: row => `${row.course_code} · Retake ${row.attempt_number}` },
    { key: 'status', header: 'Application', render: row => <div>{row.status.replaceAll('_', ' ')}{row.review_reason && <p className="text-xs">{row.review_reason}</p>}</div> },
    { key: 'fees', header: 'Payment', render: row => <div className="space-y-2"><p>{row.fee_status}</p>{row.status === 'PAYMENT_PENDING' && <><Link className="underline" href="/student/finance">Open Finance to pay the linked demand</Link><Button disabled={busy} size="sm" variant="outline" onClick={() => void action(`/api/academics/exams/backlog/attempts/${row.attempt_id}/payment-sync`, {}, 'Payment settlement verified')}>Check settled payment</Button></>}</div> },
    { key: 'result', header: 'Published retake result', render: row => row.status === 'PUBLISHED' ? `${row.marks_obtained}/${row.max_marks} · ${row.grade} · ${row.result_status}` : 'Not published' },
  ];
  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6"><header><h1 className="text-2xl font-bold text-sgvu-navy">Backlog & supplementary examinations</h1><p className="mt-2 text-sm text-muted-foreground">Apply only to an explicitly configured examination. Original marks remain available; the published selection rule controls the current course result.</p></header>
    {loading ? <p role="status">Loading available retakes…</p> : error ? <div role="alert" className="space-y-2"><p>{error}</p><Button onClick={() => void load()}>Retry</Button></div> : data && <>
      <Card><CardHeader><CardTitle>Available examinations</CardTitle></CardHeader><CardContent className="space-y-4">
        {!data.offerings.length ? <p>No configured supplementary examination is open. Examination Cell must publish the registration, fee, attempt and result-selection rules first.</p> : <>
          <label className="block space-y-1 text-sm"><span>Available retake</span><Select aria-label="Available retake" disabled={busy} value={offeringId} onChange={event => { setOfferingId(String(event.target.value)); setSourceId(''); }}><option value="">Choose an examination…</option>{data.offerings.map(row => <option key={row.offering_id} value={row.offering_id}>{row.course_code} · {row.source_exam_type} · Semester {row.semester} · {row.session_name ?? 'Session unavailable'} · Exam {displayDate(row.exam_date)} · Ref {row.offering_id.slice(0, 8)}</option>)}</Select></label>
          {offering && <><p className="text-sm">{offering.session_name ?? 'Session unavailable'} · Exam {displayDate(offering.exam_date)} · Registration {displayDate(offering.opens_at, true)} — {displayDate(offering.closes_at, true)}</p><p className="text-sm">{offering.fee_mode === 'NO_FEE' ? 'Explicitly no fee' : `Fee: ₹${offering.fee_amount}`} · Maximum {offering.attempt_limit} published retakes · {offering.selection_policy === 'BEST_ATTEMPT' ? 'Highest published percentage, including original' : 'Latest published retake'}</p><label className="block space-y-1 text-sm"><span>Declared failed result</span><Select aria-label="Declared failed result" disabled={busy} value={sourceId} onChange={event => setSourceId(String(event.target.value))}><option value="">Choose the failed result…</option>{sources.map(row => <option key={row.source_report_id} value={row.source_report_id}>{row.course_code} · {row.marks_obtained}/{row.max_marks}</option>)}</Select></label>{!sources.length && <p>No matching declared failed course is available for this offering.</p>}<Button disabled={busy || !sources.some(row => row.source_report_id === sourceId)} onClick={() => void action('/api/academics/exams/backlog/applications', { offering_id: offeringId, source_report_id: sourceId }, 'Retake application saved. Complete any required payment before Examination Cell review.')}>Apply for this retake</Button></>}
        </>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>My applications and results</CardTitle></CardHeader><CardContent><DataTable columns={columns} rows={data.applications} rowKey={row => row.attempt_id} emptyMessage="No configured retake applications submitted." /></CardContent></Card>
    </>}
  </div>;
}
