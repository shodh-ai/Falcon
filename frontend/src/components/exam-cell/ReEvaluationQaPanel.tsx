'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type QaCase = {
  request_id: string;
  qa_result_id: string;
  source: 'LOCAL_QA';
  is_qa: true;
  official_publication: false;
  exam_session: string;
  exam_type: string;
  original_marks: string | number;
  max_marks: string | number;
  revised_marks: string | number | null;
  result_marks: string | number;
  report_notes: string | null;
  status: 'ASSIGNED' | 'UNDER_REVIEW' | 'COMPLETED';
  version: number;
};

export function ReEvaluationQaPanel({ applicationId, audience }: {
  applicationId: string;
  audience: 'faculty' | 'exam-cell';
}) {
  const api = useAuthedApi();
  const [qa, setQa] = useState<QaCase | null>(null);
  const [marks, setMarks] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const savedQa = useRef<QaCase | null>(null);
  const endpoint = `/api/qa/re-evaluations/${applicationId}`;

  const accept = useCallback((data: QaCase, preserveUnchangedDraft = false) => {
    if (!data || data.request_id !== applicationId || data.source !== 'LOCAL_QA'
      || data.is_qa !== true || data.official_publication !== false
      || !Number.isInteger(data.version) || !['ASSIGNED', 'UNDER_REVIEW', 'COMPLETED'].includes(data.status)
      || !Number.isFinite(Number(data.max_marks)) || Number(data.max_marks) <= 0) {
      throw new Error('The local QA fixture is unavailable or invalid.');
    }
    const keepDraft = preserveUnchangedDraft && data.status === 'ASSIGNED'
      && savedQa.current?.request_id === data.request_id && savedQa.current.version === data.version;
    savedQa.current = data;
    setQa(data);
    if (!keepDraft) {
      setMarks(data.revised_marks == null ? '' : String(data.revised_marks));
      setNotes(data.report_notes ?? '');
    }
  }, [applicationId]);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setValidation(null);
    try {
      const data = await api.get<QaCase>(endpoint);
      if (current === generation.current) accept(data, true);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Could not load local QA data.');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [api, endpoint, accept]);

  useEffect(() => {
    // Each account and request owns its QA draft and outstanding responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQa(null);
    savedQa.current = null;
    setSuccess(null);
    setBusy(false);
    mutation.current = false;
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  async function act(action: 'report' | 'complete' | 'reset') {
    if (!qa || loading || busy || mutation.current || error) return;
    if (action === 'report' && (audience !== 'faculty' || qa.status !== 'ASSIGNED')) return;
    if (action !== 'report' && audience !== 'exam-cell') return;
    if (action === 'complete' && qa.status !== 'UNDER_REVIEW') return;
    const revised = Number(marks);
    if (action === 'report' && (!marks.trim() || !Number.isFinite(revised)
      || revised < 0 || revised > Number(qa.max_marks) || revised !== Number(revised.toFixed(2))
      || !notes.trim() || notes.trim().length > 2000)) {
      setValidation(`Enter QA marks from 0 to ${qa.max_marks} with at most two decimals and nonblank notes up to 2000 characters.`);
      return;
    }
    mutation.current = true;
    setBusy(true);
    setSuccess(null);
    setValidation(null);
    const current = generation.current;
    try {
      const data = await api.post<QaCase>(`${endpoint}/${action}`, {
        expected_version: qa.version,
        ...(action === 'report' ? { revised_marks: revised, report_notes: notes.trim() } : {}),
      });
      if (current !== generation.current) return;
      accept(data);
      setSuccess(action === 'report' ? 'QA report submitted for the Exam Cell QA review.'
        : action === 'complete' ? 'QA simulation completed. No official result was published.' : 'QA scenario reset to its starting values.');
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'QA action failed. Reload the QA case before trying again.');
    } finally {
      if (current === generation.current) { mutation.current = false; setBusy(false); }
    }
  }

  const blocked = loading || busy || Boolean(error);
  return (
    <section aria-label="Local re-evaluation QA workflow" className="space-y-3 rounded-lg border border-sky-300 bg-sky-50/50 p-4">
      <h3 className="font-semibold">Local QA workflow</h3>
      <p className="text-xs text-muted-foreground">Changes here affect only the QA scenario. Original requests, student results and parent notifications stay untouched.</p>
      {loading ? <p role="status">Loading QA scenario…</p> : null}
      {error ? <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" disabled={loading || busy} onClick={() => void load()}>Reload QA scenario</Button></div> : null}
      {validation ? <p role="alert">{validation}</p> : null}
      {success ? <p role="status">{success}</p> : null}
      {qa ? <>
        <p><strong>QA status:</strong> {qa.status.replaceAll('_', ' ')}</p>
        <p><strong>QA session:</strong> {qa.exam_session}</p>
        <p className="break-all text-xs"><strong>QA result reference:</strong> {qa.qa_result_id}</p>
        <p><strong>QA original marks:</strong> {qa.original_marks} / {qa.max_marks}</p>
        <p><strong>QA result marks:</strong> {qa.result_marks} / {qa.max_marks}</p>
        {qa.revised_marks != null ? <p><strong>QA revised marks:</strong> {qa.revised_marks}</p> : null}
        {qa.report_notes ? <p className="whitespace-pre-wrap"><strong>QA report:</strong> {qa.report_notes}</p> : null}
        {audience === 'faculty' && qa.status === 'ASSIGNED' ? <div className="space-y-2">
          <label htmlFor={`qa-marks-${applicationId}`} className="block font-medium">QA revised marks</label>
          <Input id={`qa-marks-${applicationId}`} type="number" min={0} max={Number(qa.max_marks)} step="0.01" value={marks} disabled={blocked}
            onChange={event => setMarks(event.target.value)} />
          <label htmlFor={`qa-notes-${applicationId}`} className="block font-medium">QA reassessment notes</label>
          <textarea id={`qa-notes-${applicationId}`} value={notes} maxLength={2000} disabled={blocked} className="min-h-24 w-full rounded-md border p-2"
            onChange={event => setNotes(event.target.value)} />
          <Button disabled={blocked} onClick={() => void act('report')}>Submit QA report</Button>
        </div> : null}
        {audience === 'faculty' && qa.status === 'UNDER_REVIEW' ? <p>Awaiting review in the Exam Cell local QA workflow.</p> : null}
        {audience === 'exam-cell' ? <div className="flex flex-wrap gap-2">
          {qa.status === 'UNDER_REVIEW' ? <Button disabled={blocked} onClick={() => void act('complete')}>Complete QA simulation</Button> : null}
          <Button variant="outline" disabled={blocked} onClick={() => void act('reset')}>Reset QA scenario</Button>
          {qa.status === 'ASSIGNED' ? <p className="w-full text-xs">The assigned faculty member submits the QA report from Faculty → Re-evaluation.</p> : null}
        </div> : null}
        {qa.status === 'COMPLETED' ? <p className="font-medium">QA scenario completed. This is not an official publication.</p> : null}
      </> : null}
    </section>
  );
}
