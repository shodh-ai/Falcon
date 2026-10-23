'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authHeaders, getApiBaseUrl } from '@/lib/api/client';
import { getSubdomainFromClient } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export type ResultViewerSession = {
  session_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  semester: number;
  entry_status: string;
  marks_locked: boolean;
  declared_at: string | null;
  declaration_note?: string | null;
};

export type DeclaredResultRow = {
  report_id: string;
  session_id: string;
  student_user_id: string;
  student_name: string | null;
  enrollment_number: string | null;
  course_code: string;
  course_name: string;
  semester: number;
  exam_type: string;
  marks_obtained: number | string | null;
  max_marks: number | string | null;
  grade: string | null;
  result_status: string | null;
  session_declared_at: string | null;
  declaration_note: string | null;
  result_id: string | null;
  exam_session: string | null;
  canonical_marks_obtained: number | string | null;
  canonical_max_marks: number | string | null;
  canonical_grade: string | null;
  canonical_status: string | null;
  source_mark_id: string | null;
  source_report_id: string | null;
  verification_status: 'verified' | 'unverified' | 'qa';
  verification_message: string;
};

function display(value: string | number | null | undefined) {
  return value == null || String(value).trim() === '' ? 'Unavailable' : String(value);
}

function declarationDate(value: string | null) {
  if (!value) return 'Not declared';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Declaration date unavailable' : `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(date)} IST`;
}

export function DeclaredResultViewer({ session }: { session: ResultViewerSession | null }) {
  const { token, user, isLoading } = useAuth();
  const tenant = getSubdomainFromClient();
  // Remounting discards rows and filters before rendering another account or session.
  const scope = JSON.stringify([user?.user_id, user?.tenant_id, user?.tenant_schema, tenant, session?.session_id]);

  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardHeader className="border-b border-sgvu-navy/10 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Published student reports</CardTitle>
          <Badge variant="outline">Read only</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Review existing reports and their published result references. Viewing, searching and retrying leave marks and request links unchanged.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-5 md:p-6">
        {!session ? (
          <p className="text-sm text-muted-foreground">Select an existing session above to review its student reports.</p>
        ) : isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">Checking your account…</p>
        ) : !token || !user ? (
          <p role="alert" className="text-sm text-muted-foreground">Sign in with an authorized Exam Cell account to view student reports.</p>
        ) : (
          <SessionReports key={scope} session={session} token={token} tenant={tenant} />
        )}
      </CardContent>
    </Card>
  );
}

function SessionReports({ session, token, tenant }: { session: ResultViewerSession; token: string; tenant: string }) {
  const [revision, setRevision] = useState(0);
  const requestScope = useMemo(() => ({ sessionId: session.session_id, token, tenant, revision }), [session.session_id, token, tenant, revision]);
  const [responseState, setResponseState] = useState<{ scope: object; rows: DeclaredResultRow[]; loading: boolean; error: string | null }>(() => ({ scope: requestScope, rows: [], loading: true, error: null }));
  // Token refreshes also hide the previous response synchronously; credentials
  // are never included in React keys, rendered content or diagnostic messages.
  const { rows, loading, error } = responseState.scope === requestScope ? responseState : { rows: [], loading: true, error: null };
  const [query, setQuery] = useState('');
  const searchId = useId();
  const reportsId = useId();

  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    void (async () => {
      try {
        // Use the real read endpoint directly: the generic Exam Cell client can
        // return development fallback data, which must never verify a result.
        const response = await fetch(`${getApiBaseUrl()}/api/exam-cell/result-control/sessions/${encodeURIComponent(session.session_id)}/reports`, {
          method: 'GET',
          cache: 'no-store',
          headers: { ...authHeaders(token), 'x-tenant-subdomain': tenant },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error('Your account is not authorized to view these student reports.');
          }
          throw new Error('Student reports could not be loaded. Retry when the connection is available.');
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || data.some((row) => !row || typeof row !== 'object' || typeof row.report_id !== 'string' || row.session_id !== session.session_id || typeof row.student_user_id !== 'string' || typeof row.exam_type !== 'string' || typeof row.course_code !== 'string' || !['verified', 'unverified', 'qa'].includes(row.verification_status))) {
          throw new Error('The report response does not match this session. Retry to load the current records.');
        }
        if (current) setResponseState({ scope: requestScope, rows: data as DeclaredResultRow[], loading: false, error: null });
      } catch (failure) {
        if (current && !controller.signal.aborted) {
          setResponseState({ scope: requestScope, rows: [], loading: false, error: failure instanceof Error ? failure.message : 'Student reports could not be loaded.' });
        }
      }
    })();

    return () => {
      current = false;
      controller.abort();
    };
  }, [session.session_id, token, tenant, revision, requestScope]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => [row.student_name, row.enrollment_number, row.student_user_id].some((value) => String(value ?? '').toLowerCase().includes(term)));
  }, [query, rows]);
  const note = session.declaration_note ?? rows[0]?.declaration_note;

  return (
    <>
      <dl className="grid gap-3 rounded-xl border border-sgvu-navy/10 bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Course and exam</dt><dd className="font-semibold">{session.course_code} · {session.exam_type.replaceAll('_', ' ')} · Semester {session.semester}</dd><dd>{session.course_name}</dd></div>
        <div><dt className="text-muted-foreground">Session ID</dt><dd className="break-all font-mono text-xs">{session.session_id}</dd></div>
        <div><dt className="text-muted-foreground">Entry status</dt><dd>{session.entry_status} · {session.marks_locked ? 'Marks locked' : 'Marks unlocked'}</dd></div>
        <div><dt className="text-muted-foreground">Declaration recorded</dt><dd>{declarationDate(session.declared_at)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Declaration note</dt><dd className="whitespace-pre-wrap break-words">{note?.trim() || 'No declaration note recorded.'}</dd></div>
      </dl>
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        A declared session alone does not verify an official student result. Check the individual result reference and source evidence. QA or unverified records cannot establish an official re-evaluation link.
      </p>

      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading existing student reports…</p> : null}
      {error ? (
        <div role="alert" className="space-y-3 rounded-lg border border-red-200 p-4 text-sm">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry student reports</Button>
        </div>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No declared student reports exist for this session. No official student result can be verified from this view yet.</p>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <>
          <div className="space-y-2">
            <label htmlFor={searchId} className="text-sm font-medium">Find student by name or enrollment ID</label>
            <Input id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, enrollment or student ID" aria-controls={reportsId} />
            <p role="status" className="text-xs text-muted-foreground">{filtered.length} of {rows.length} reports shown</p>
          </div>
          {filtered.length === 0 ? <p className="text-sm text-muted-foreground">No reports match this student search.</p> : (
            <div id={reportsId} role="region" aria-label="Existing student reports" tabIndex={0} className="max-h-[36rem] overflow-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <caption className="sr-only">Existing student reports for {session.course_code} {session.exam_type}. All marks are read only.</caption>
                <thead className="sticky top-0 bg-slate-50 text-xs"><tr>{['Student', 'Exam and session', 'Report original / maximum', 'Published result original / maximum', 'Grade and result status', 'Result references', 'Source verification'].map((heading) => <th key={heading} scope="col" className="p-3 align-top">{heading}</th>)}</tr></thead>
                <tbody className="divide-y">{filtered.map((row) => (
                  <tr key={row.report_id}>
                    <th scope="row" className="min-w-40 p-3 align-top font-normal"><p className="font-semibold">{display(row.student_name)}</p><p>{display(row.enrollment_number)}</p><p className="mt-1 break-all text-xs text-muted-foreground">Student ID: {row.student_user_id}</p></th>
                    <td className="p-3 align-top"><p>{row.course_code} · {row.exam_type.replaceAll('_', ' ')}</p><p>Semester {row.semester}</p><p className="mt-1">{row.exam_session ? `Published exam: ${row.exam_session}` : 'Published exam session unavailable'}</p></td>
                    <td className="p-3 align-top tabular-nums">{display(row.marks_obtained)} / {display(row.max_marks)}</td>
                    <td className="p-3 align-top tabular-nums">{row.result_id ? `${display(row.canonical_marks_obtained)} / ${display(row.canonical_max_marks)}` : 'No matching published result'}</td>
                    <td className="p-3 align-top"><p>Report: {display(row.grade)} · {display(row.result_status)}</p><p className="mt-1">Published: {display(row.canonical_grade)} · {display(row.canonical_status)}</p></td>
                    <td className="max-w-64 space-y-2 break-all p-3 align-top text-xs"><p>Report ID: <span className="font-mono">{row.report_id}</span></p><p>Published result ID: <span className="font-mono">{display(row.result_id)}</span></p><p>Source report ID: <span className="font-mono">{display(row.source_report_id)}</span></p><p>Source mark ID: <span className="font-mono">{display(row.source_mark_id)}</span></p></td>
                    <td className="min-w-60 p-3 align-top"><Badge variant={row.verification_status === 'verified' ? 'default' : row.verification_status === 'qa' ? 'destructive' : 'outline'}>{row.verification_status === 'verified' ? 'Verified published source' : row.verification_status === 'qa' ? 'QA / demo source' : 'Unverified source'}</Badge><p className="mt-2">{row.verification_message || 'Official source evidence is unavailable.'}</p></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
