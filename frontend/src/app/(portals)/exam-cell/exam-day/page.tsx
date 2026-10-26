'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';
import { ExamDayOperationsPanel } from '@/components/exam-cell/ExamDayOperationsPanel';

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
};

const STATUSES = ['PRESENT', 'ABSENT', 'MEDICAL', 'DEBARRED', 'LATE'] as const;

export default function ExamCellExamDayPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canMark = canExamCellAction(user?.primaryRole ?? user?.role, 'manage_sessions');
  const [examSnapshot, setExamSnapshot] = useState<{
    api: typeof api; date: string; exams: TodayExam[]; error: string | null;
  } | null>(null);
  const [selectedExam, setSelectedExam] = useState('');
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [examDate, setExamDate] = useState('');
  const [detailsSnapshot, setDetailsSnapshot] = useState<{
    api: typeof api; examId: string; attendance: AttendanceRow[]; roster: RosterRow[]; error: string | null;
  } | null>(null);
  const [refreshingExams, setRefreshingExams] = useState(false);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  const examsRequest = useRef(0);
  const detailsRequest = useRef(0);
  const markingInFlight = useRef(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [qrInput, setQrInput] = useState('');
  const [verified, setVerified] = useState<VerifiedStudent | null>(null);
  const [verifying, setVerifying] = useState(false);

  const loadExams = useCallback(() => {
    const requestId = ++examsRequest.current;
    const dateQuery = examDate ? `?date=${encodeURIComponent(examDate)}` : '';
    return api.get<TodayExam[]>(`/api/exam-cell/exam-day/today${dateQuery}`).then(
      (exams) => {
        if (requestId !== examsRequest.current) return;
        setExamSnapshot({ api, date: examDate, exams, error: null });
        setSelectedExam((current) => exams.some((exam) => exam.exam_schedule_id === current)
          ? current : exams[0]?.exam_schedule_id ?? '');
      },
      (e: unknown) => {
        if (requestId === examsRequest.current) setExamSnapshot({
          api, date: examDate, exams: [], error: e instanceof Error ? e.message : 'Failed to load today\'s exams',
        });
      },
    ).finally(() => {
      if (requestId === examsRequest.current) setRefreshingExams(false);
    });
  }, [api, examDate]);

  const loadAttendance = useCallback(() => {
    if (!selectedExam) return Promise.resolve();
    const requestId = ++detailsRequest.current;
    return Promise.all([
      api.get<AttendanceRow[]>(`/api/exam-cell/exam-day/attendance?exam_schedule_id=${selectedExam}`),
      api.get<RosterRow[]>(`/api/exam-cell/exam-day/roster?exam_schedule_id=${selectedExam}`),
    ]).then(
      ([attendanceRows, rosterRows]) => {
        if (requestId !== detailsRequest.current) return;
        setDetailsSnapshot({ api, examId: selectedExam, attendance: attendanceRows, roster: rosterRows, error: null });
      },
      (e: unknown) => {
        if (requestId !== detailsRequest.current) return;
        setDetailsSnapshot({
          api, examId: selectedExam, attendance: [], roster: [],
          error: e instanceof Error ? e.message : 'Failed to load the examination roster',
        });
      },
    ).finally(() => {
      if (requestId === detailsRequest.current) setRefreshingDetails(false);
    });
  }, [api, selectedExam]);

  useEffect(() => {
    void loadExams();
    return () => { examsRequest.current += 1; };
  }, [loadExams]);
  useEffect(() => {
    void loadAttendance();
    return () => { detailsRequest.current += 1; };
  }, [loadAttendance]);

  const currentExams = examSnapshot?.api === api && examSnapshot.date === examDate ? examSnapshot : null;
  const loading = refreshingExams || !currentExams;
  const todayExams = currentExams?.exams ?? [];
  const loadError = !loading ? currentExams?.error : null;
  const detailsMatch = detailsSnapshot?.api === api && detailsSnapshot.examId === selectedExam;
  const detailsError = detailsMatch && !refreshingDetails ? detailsSnapshot.error : null;
  const roster = detailsMatch ? detailsSnapshot.roster : [];
  const attendance = detailsMatch ? detailsSnapshot.attendance : [];
  const detailsReady = !!selectedExam && detailsMatch &&
    !loading && !loadError && !refreshingDetails && !detailsError;
  const identityOnRoster = detailsReady && !!verified &&
    roster.some((row) => row.student_user_id === verified.student.user_id);

  async function verifyQr() {
    if (verifying) return;
    const payload = qrInput.trim();
    if (!payload) {
      toast.error('Enter an enrollment number or scan a hall ticket QR');
      return;
    }
    setVerifying(true);
    setVerified(null);
    try {
      const res = await api.post<VerifiedStudent>('/api/exam-cell/identity/verify', {
        qr_payload: payload,
      });
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
      });
      toast.success(`Student record found: ${student.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
      setVerified(null);
    } finally {
      setVerifying(false);
    }
  }

  async function markAttendance(studentUserId: string, status: string) {
    if (!canMark || !detailsReady || operationsBusy || markingInFlight.current ||
      !roster.some((row) => row.student_user_id === studentUserId)) return;
    markingInFlight.current = true;
    setMarkingId(studentUserId);
    try {
      await api.post('/api/exam-cell/exam-day/attendance', {
        exam_schedule_id: selectedExam,
        student_user_id: studentUserId,
        status,
      });
      toast.success(`Marked ${status.toLowerCase()}`);
      setRefreshingDetails(true);
      await loadAttendance();
      setRefreshingExams(true);
      await loadExams();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark attendance');
    } finally {
      markingInFlight.current = false;
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
              disabled={!!markingId || operationsBusy || !detailsReady}
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="h-10 flex-1 rounded-lg border-sgvu-navy/20"
              placeholder="Scan hall ticket QR or enter enrollment number"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
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
              disabled={verifying}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          {verified ? (
            <div className="flex flex-wrap gap-4 rounded-lg border bg-slate-50/80 p-4">
              <div>
                <p className="font-bold text-sgvu-navy">{verified.student.name}</p>
                <p className="text-sm text-muted-foreground">{verified.student.enrollment_number ?? '—'} · {(verified.student as { branch_name?: string; branch?: string }).branch_name ?? verified.student.branch ?? 'Program'} · Sem {verified.student.semester ?? '—'}</p>
                <Badge className="mt-2" variant="outline">Student record found — not an entry clearance</Badge>
                {detailsReady ? <p className="mt-2 text-sm text-muted-foreground">{identityOnRoster
                  ? 'Listed on the selected examination seating roster.'
                  : 'Not on the selected examination seating roster. Attendance cannot be recorded.'}</p> : null}
              </div>
              {verified.seating.length > 0 ? (
                <div className="text-sm">
                  <p className="font-medium">Seat assignment</p>
                  {verified.seating.map((s, i) => (
                    <p key={i} className="text-muted-foreground">{s.subject_name}: Room {s.room}, Seat {s.seat_number}</p>
                  ))}
                </div>
              ) : null}
              {canMark && identityOnRoster ? (
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map((s) => (
                    <Button key={s} size="sm" variant="outline" disabled={!!markingId || operationsBusy} onClick={() => void markAttendance(verified.student.user_id, s)}>
                      Mark {s}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3"><CardTitle className="text-base">{examDate ? 'Examinations on selected date' : "Today's examination sessions"}</CardTitle>
          <div className="flex items-center gap-2"><label htmlFor="exam-day-date" className="text-sm">Examination date</label><Input id="exam-day-date" type="date" className="w-auto" disabled={!!markingId || operationsBusy} value={examDate} onChange={e => setExamDate(e.target.value)} /></div>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 aria-label="Loading today's exams" className="h-6 w-6 animate-spin" /> : loadError ? (
            <div role="alert" className="space-y-2 text-sm text-red-700">
              <p>{loadError}</p>
              <Button variant="outline" onClick={() => { setRefreshingExams(true); void loadExams(); }}>Retry loading exams</Button>
            </div>
          ) : todayExams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{examDate ? 'No exams scheduled for this date.' : 'No exams scheduled for today.'}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {todayExams.map((e) => (
                <button
                  key={e.exam_schedule_id}
                  type="button"
                  disabled={!!markingId || operationsBusy}
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

      {selectedExam && !loadError ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Seating roster — mark attendance</CardTitle>
            <label className="sr-only" htmlFor="exam-day-roster-exam">Examination seating roster</label>
            <Select id="exam-day-roster-exam" disabled={!!markingId || operationsBusy} className="rounded-md border px-2 py-1 text-sm" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              {todayExams.map((e) => <option key={e.exam_schedule_id} value={e.exam_schedule_id}>{e.subject_name ?? e.exam_type}</option>)}
            </Select>
          </CardHeader>
          <CardContent>
            {detailsError ? (
              <div role="alert" className="space-y-2 text-sm text-red-700">
                <p>{detailsError}</p>
                <Button variant="outline" onClick={() => { setRefreshingDetails(true); void loadAttendance(); }}>Retry loading roster</Button>
              </div>
            ) : !detailsReady ? <p role="status" className="text-sm text-muted-foreground">Loading seating roster and attendance…</p> : (
              <DataTable columns={rosterColumns} rows={roster} rowKey={(r) => r.student_user_id} emptyMessage="No seating allocations for this session. Check the seating plan before recording attendance." />
            )}
          </CardContent>
        </Card>
      ) : null}

      {detailsReady ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Attendance register</CardTitle>
            <label className="sr-only" htmlFor="exam-day-register-exam">Attendance register examination</label>
            <Select id="exam-day-register-exam" disabled={!!markingId || operationsBusy} className="rounded-md border px-2 py-1 text-sm" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              {todayExams.map((e) => <option key={e.exam_schedule_id} value={e.exam_schedule_id}>{e.subject_name ?? e.exam_type}</option>)}
            </Select>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} rows={attendance} rowKey={(r) => r.attendance_id} emptyMessage="No attendance marked yet for this session." />
          </CardContent>
        </Card>
      ) : null}
      {detailsReady ? <ExamDayOperationsPanel api={api} scheduleId={selectedExam} role={user?.primaryRole ?? user?.role} onBusyChange={setOperationsBusy} /> : null}
    </div>
  );
}
