'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type TodayExam = {
  exam_schedule_id: string;
  exam_type: string;
  exam_date: string;
  start_time: string;
  venue: string;
  subject_name: string;
  marked_count: number;
};

type AttendanceRow = {
  attendance_id: string;
  student_name: string;
  enrollment_number: string | null;
  status: string;
  marked_at: string;
};

type RosterRow = {
  student_user_id: string;
  student_name: string;
  enrollment_number: string | null;
  room: string | null;
  seat_number: string | null;
  attendance_status: string | null;
  attendance_id: string | null;
};

type VerifiedStudent = {
  student: {
    user_id: string;
    name: string;
    enrollment_number: string | null;
    profile_picture_url: string | null;
    branch: string | null;
    semester: number | null;
  };
  seating: Array<{ room: string; seat_number: string; subject_name: string; exam_date: string }>;
  verified: boolean;
  hall_ticket_verified?: boolean;
  issue_id?: string;
};

const STATUSES = ['PRESENT', 'ABSENT', 'MEDICAL', 'DEBARRED', 'LATE'] as const;

export default function ExamCellExamDayPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canMark = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'manage_sessions');
  const canVerify = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'manage_seating');
  const canRevoke = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'publish_results');
  const [chosenExam, setSelectedExam] = useState('');
  const [examRevision, setExamRevision] = useState(0);
  const [examResource, setExamResource] = useState<{ api: typeof api | null; revision: number; rows: TodayExam[]; error: string | null }>({ api: null, revision: -1, rows: [], error: null });
  const loading = examResource.api !== api || examResource.revision !== examRevision;
  const todayExams = loading ? [] : examResource.rows;
  const examError = loading ? null : examResource.error;
  const selectedExam = todayExams.some((exam) => exam.exam_schedule_id === chosenExam) ? chosenExam : (todayExams[0]?.exam_schedule_id ?? '');
  const [attendanceRevision, setAttendanceRevision] = useState(0);
  const attendanceKey = `${selectedExam}:${attendanceRevision}`;
  const [attendanceResource, setAttendanceResource] = useState<{ api: typeof api | null; key: string; rows: AttendanceRow[]; roster: RosterRow[]; error: string | null }>({ api: null, key: '', rows: [], roster: [], error: null });
  const attendanceLoading = attendanceResource.api !== api || attendanceResource.key !== attendanceKey;
  const attendance = attendanceLoading ? [] : attendanceResource.rows;
  const roster = attendanceLoading ? [] : attendanceResource.roster;
  const attendanceError = attendanceLoading ? null : attendanceResource.error;
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [qrInput, setQrInput] = useState('');
  const [verification, setVerification] = useState<{ api: typeof api; result: VerifiedStudent } | null>(null);
  const verified = verification?.api === api ? verification.result : null;
  function setVerified(result: VerifiedStudent | null) {
    setVerification(result ? { api, result } : null);
  }
  const [verifying, setVerifying] = useState(false);
  const [revocationOpen, setRevocationOpen] = useState(false);
  const [revocationReason, setRevocationReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const revokePending = useRef(false);
  const verificationScope = useRef(0);
  const verifyPending = useRef(false);
  const markPending = useRef(false);

  useEffect(() => () => { verificationScope.current += 1; }, [api]);

  useEffect(() => {
    let cancelled = false;
    api.get<TodayExam[]>('/api/exam-cell/exam-day/today').then(
      (rows) => { if (!cancelled) setExamResource({ api, revision: examRevision, rows, error: null }); },
      (cause) => { if (!cancelled) setExamResource({ api, revision: examRevision, rows: [], error: cause instanceof Error ? cause.message : "Failed to load today's exams" }); },
    );
    return () => { cancelled = true; };
  }, [api, examRevision]);

  useEffect(() => {
    if (!selectedExam) return;
    let cancelled = false;
    Promise.all([
        api.get<AttendanceRow[]>(`/api/exam-cell/exam-day/attendance?exam_schedule_id=${selectedExam}`),
        api.get<RosterRow[]>(`/api/exam-cell/exam-day/roster?exam_schedule_id=${selectedExam}`),
    ]).then(
      ([rows, rosterRows]) => { if (!cancelled) setAttendanceResource({ api, key: attendanceKey, rows, roster: rosterRows, error: null }); },
      (cause) => { if (!cancelled) setAttendanceResource({ api, key: attendanceKey, rows: [], roster: [], error: cause instanceof Error ? cause.message : 'Failed to load attendance' }); },
    );
    return () => { cancelled = true; };
  }, [api, selectedExam, attendanceKey]);

  async function verifyQr() {
    if (!canVerify || verifyPending.current) return;
    const payload = qrInput.trim();
    if (!payload) {
      toast.error('Enter an enrollment number or scan a hall ticket QR');
      return;
    }
    verifyPending.current = true;
    setVerifying(true);
    setVerified(null);
    const scope = verificationScope.current;
    try {
      const res = await api.post<VerifiedStudent>('/api/exam-cell/identity/verify', {
        qr_payload: payload,
      });
      if (scope !== verificationScope.current) return;
      if (res.verified !== true || !res.student?.user_id) throw new Error('Student identity could not be verified');
      const student = {
        ...res.student,
        branch:
          res.student.branch ??
          (res.student as { branch_name?: string | null }).branch_name ??
          null,
      };
      setVerified({
        ...res,
        student,
        seating: Array.isArray(res.seating) ? res.seating : [],
        verified: true,
      });
      toast.success(`${student.name} verified`);
    } catch (e) {
      if (scope !== verificationScope.current) return;
      toast.error(e instanceof Error ? e.message : 'Verification failed');
      setVerified(null);
    } finally {
      verifyPending.current = false;
      setVerifying(false);
    }
  }

  async function revokeTicket() {
    if (!canRevoke || !verified?.issue_id || !verified.hall_ticket_verified || revokePending.current || !revocationReason.trim()) return;
    revokePending.current = true;
    setRevoking(true);
    const scope = verificationScope.current;
    try {
      const result = await api.post<{ revoked: boolean }>(`/api/exam-cell/hall-ticket-issues/${verified.issue_id}/revoke`, { reason: revocationReason.trim() });
      if (scope !== verificationScope.current) return;
      if (result.revoked !== true) throw new Error('The server did not confirm hall-ticket revocation');
      setVerified(null);
      setRevocationOpen(false);
      setRevocationReason('');
      toast.success('This hall-ticket record was revoked');
    } catch (error) {
      if (scope === verificationScope.current) toast.error(error instanceof Error ? error.message : 'Could not revoke this hall ticket');
    } finally {
      revokePending.current = false;
      setRevoking(false);
    }
  }

  async function markAttendance(studentUserId: string, status: string) {
    if (!canMark || !selectedExam || markPending.current || attendanceLoading || attendanceError) return;
    markPending.current = true;
    setMarkingId(studentUserId);
    try {
      await api.post('/api/exam-cell/exam-day/attendance', {
        exam_schedule_id: selectedExam,
        student_user_id: studentUserId,
        status,
      });
      toast.success(`Marked ${status.toLowerCase()}`);
      setAttendanceRevision((value) => value + 1);
      setExamRevision((value) => value + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark attendance');
    } finally {
      markPending.current = false;
      setMarkingId(null);
    }
  }

  const columns: DataTableColumn<AttendanceRow>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'time', header: 'Marked at', render: (r) => new Date(r.marked_at).toLocaleTimeString('en-IN') },
  ];

  const rosterColumns: DataTableColumn<RosterRow>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'seat', header: 'Seat', render: (r) => (
      <span className="text-sm">{r.room ? `Room ${r.room}, Seat ${r.seat_number ?? '—'}` : '—'}</span>
    ) },
    { key: 'status', header: 'Status', render: (r) => (
      r.attendance_status ? <Badge>{r.attendance_status}</Badge> : <Badge variant="outline">Not marked</Badge>
    ) },
    {
      key: 'actions',
      header: 'Mark',
      render: (r) => canMark ? (
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={r.attendance_status === s ? 'default' : 'outline'}
              disabled={markingId !== null}
              onClick={() => void markAttendance(r.student_user_id, s)}
            >
              {s}
            </Button>
          ))}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="exam-day" />
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><QrCode className="h-4 w-4" />Student identity verification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label htmlFor="exam-identity" className="block text-sm font-medium text-sgvu-navy">Hall ticket QR or enrollment number</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="exam-identity"
              className="h-10 flex-1 rounded-lg border-sgvu-navy/20"
              placeholder="Scan hall ticket QR or enter enrollment number"
              value={qrInput}
              disabled={verifying || !canVerify}
              onChange={(e) => { setQrInput(e.target.value); setVerified(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void verifyQr();
                }
              }}
            />
            <Button
              variant="outline"
              className="h-10 shrink-0 border border-[#0B2447] bg-[#0B2447] px-5 font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60"
              onClick={() => void verifyQr()}
              disabled={!canVerify || verifying || !qrInput.trim()}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          {verified ? (
            <div className="flex flex-wrap gap-4 rounded-lg border bg-slate-50/80 p-4">
              <div>
                <p className="font-bold text-sgvu-navy">{verified.student.name}</p>
                <p className="text-sm text-muted-foreground">{verified.student.enrollment_number ?? '—'} · {(verified.student as { branch_name?: string; branch?: string }).branch_name ?? verified.student.branch ?? 'Program'} · Sem {verified.student.semester ?? '—'}</p>
                <Badge className="mt-2 bg-emerald-600">Identity verified</Badge>
                {verified.hall_ticket_verified ? <Badge className="ml-2 mt-2 bg-emerald-600">Current hall ticket verified</Badge> : <p className="mt-2 text-xs text-muted-foreground">Student identity checked. Scan the printed QR to verify a hall ticket.</p>}
                {canRevoke && verified.hall_ticket_verified && verified.issue_id ? <Button className="mt-3 block" size="sm" variant="destructive" onClick={() => { setRevocationReason(''); setRevocationOpen(true); }}>Revoke this hall ticket</Button> : null}
              </div>
              {verified.seating.length > 0 ? (
                <div className="text-sm">
                  <p className="font-medium">Seat assignment</p>
                  {verified.seating.map((s, i) => (
                    <p key={i} className="text-muted-foreground">{s.subject_name}: Room {s.room}, Seat {s.seat_number}</p>
                  ))}
                </div>
              ) : null}
              {canMark && selectedExam ? (
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map((s) => (
                    <Button key={s} size="sm" variant="outline" disabled={markingId !== null || attendanceLoading || !!attendanceError} onClick={() => void markAttendance(verified.student.user_id, s)}>
                      Mark {s}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={revocationOpen && !!verified} onOpenChange={(open) => { if (!revoking) setRevocationOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revoke this printed hall ticket</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Its QR will stop verifying. This action preserves the record and audit history.</p>
          <label htmlFor="hall-ticket-revocation-reason" className="text-sm font-medium">Reason</label>
          <Input id="hall-ticket-revocation-reason" value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} maxLength={500} disabled={revoking} />
          <DialogFooter><Button variant="outline" disabled={revoking} onClick={() => setRevocationOpen(false)}>Cancel</Button><Button variant="destructive" disabled={revoking || !revocationReason.trim()} onClick={() => void revokeTicket()}>{revoking ? 'Revoking…' : 'Confirm revocation'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-base">Today&apos;s examination sessions</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 aria-label="Loading examination sessions" className="h-6 w-6 animate-spin" /> : examError ? (
            <div role="alert" className="space-y-3 text-sm text-destructive"><p>{examError}</p><Button variant="outline" onClick={() => setExamRevision((value) => value + 1)}>Retry</Button></div>
          ) : todayExams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exams scheduled for today.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {todayExams.map((e) => (
                <button
                  key={e.exam_schedule_id}
                  type="button"
                  onClick={() => setSelectedExam(e.exam_schedule_id)}
                  className={`rounded-lg border p-3 text-left transition ${selectedExam === e.exam_schedule_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'hover:border-sgvu-navy/20'}`}
                >
                  <p className="font-medium">{e.subject_name ?? e.exam_type}</p>
                  <p className="text-xs text-muted-foreground">{e.start_time?.slice(0, 5)} · {e.venue}</p>
                  <Badge variant="outline" className="mt-1">{e.marked_count ?? 0} marked</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedExam && roster.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Seating roster — mark attendance</CardTitle>
            <Select className="rounded-md border px-2 py-1 text-sm" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              {todayExams.map((e) => <option key={e.exam_schedule_id} value={e.exam_schedule_id}>{e.subject_name ?? e.exam_type}</option>)}
            </Select>
          </CardHeader>
          <CardContent>
            <DataTable columns={rosterColumns} rows={roster} rowKey={(r) => r.student_user_id} emptyMessage="No seating allocations for this session. Publish seating plan first." />
          </CardContent>
        </Card>
      ) : null}

      {selectedExam ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Attendance register</CardTitle>
            <Select className="rounded-md border px-2 py-1 text-sm" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              {todayExams.map((e) => <option key={e.exam_schedule_id} value={e.exam_schedule_id}>{e.subject_name ?? e.exam_type}</option>)}
            </Select>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? <p role="status">Loading attendance…</p> : attendanceError ? (
              <div role="alert" className="space-y-3 text-sm text-destructive"><p>{attendanceError}</p><Button variant="outline" onClick={() => setAttendanceRevision((value) => value + 1)}>Retry attendance</Button></div>
            ) : <DataTable columns={columns} rows={attendance} rowKey={(r) => r.attendance_id} emptyMessage="No attendance marked yet for this session." />}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
