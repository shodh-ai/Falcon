'use client';

import { useCallback, useEffect, useState } from 'react';
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
};

const STATUSES = ['PRESENT', 'ABSENT', 'MEDICAL', 'DEBARRED', 'LATE'] as const;

export default function ExamCellExamDayPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canMark = canExamCellAction(user?.roles ?? user?.role, 'manage_seating');
  const [todayExams, setTodayExams] = useState<TodayExam[]>([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [qrInput, setQrInput] = useState('');
  const [verified, setVerified] = useState<VerifiedStudent | null>(null);
  const [verifying, setVerifying] = useState(false);

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const exams = await api.get<TodayExam[]>('/api/exam-cell/exam-day/today');
      setTodayExams(exams);
      if (!selectedExam && exams[0]) setSelectedExam(exams[0].exam_schedule_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load today\'s exams');
    } finally {
      setLoading(false);
    }
  }, [api, selectedExam]);

  const loadAttendance = useCallback(async () => {
    if (!selectedExam) return;
    try {
      const [attendanceRows, rosterRows] = await Promise.all([
        api.get<AttendanceRow[]>(`/api/exam-cell/exam-day/attendance?exam_schedule_id=${selectedExam}`),
        api.get<RosterRow[]>(`/api/exam-cell/exam-day/roster?exam_schedule_id=${selectedExam}`),
      ]);
      setAttendance(attendanceRows);
      setRoster(rosterRows);
    } catch {
      setAttendance([]);
      setRoster([]);
    }
  }, [api, selectedExam]);

  useEffect(() => { void loadExams(); }, [loadExams]);
  useEffect(() => { void loadAttendance(); }, [loadAttendance]);

  async function verifyQr() {
    if (!qrInput.trim()) return;
    setVerifying(true);
    try {
      const res = await api.post<VerifiedStudent>('/api/exam-cell/identity/verify', { qr_payload: qrInput.trim() });
      setVerified(res);
      toast.success(`${res.student.name} verified`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
      setVerified(null);
    } finally {
      setVerifying(false);
    }
  }

  async function markAttendance(studentUserId: string, status: string) {
    if (!selectedExam) return;
    setMarkingId(studentUserId);
    try {
      await api.post('/api/exam-cell/exam-day/attendance', {
        exam_schedule_id: selectedExam,
        student_user_id: studentUserId,
        status,
      });
      toast.success(`Marked ${status.toLowerCase()}`);
      await loadAttendance();
      await loadExams();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark attendance');
    } finally {
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
              disabled={markingId === r.student_user_id}
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
      <ExamCellPageHeader pageId="exam-day" />

      <Card className="border-sgvu-gold/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><QrCode className="h-4 w-4" />Student identity verification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Scan hall ticket QR or enter enrollment number" value={qrInput} onChange={(e) => setQrInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void verifyQr()} />
            <Button onClick={() => void verifyQr()} disabled={verifying}>{verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}</Button>
          </div>
          {verified ? (
            <div className="flex flex-wrap gap-4 rounded-lg border bg-slate-50/80 p-4">
              <div>
                <p className="font-bold text-sgvu-navy">{verified.student.name}</p>
                <p className="text-sm text-muted-foreground">{verified.student.enrollment_number ?? '—'} · {(verified.student as { branch_name?: string; branch?: string }).branch_name ?? verified.student.branch ?? 'Program'} · Sem {verified.student.semester ?? '—'}</p>
                <Badge className="mt-2 bg-emerald-600">Verified for entry</Badge>
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
                    <Button key={s} size="sm" variant="outline" onClick={() => void markAttendance(verified.student.user_id, s)}>
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
        <CardHeader><CardTitle className="text-base">Today&apos;s examination sessions</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : todayExams.length === 0 ? (
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
            <DataTable columns={columns} rows={attendance} rowKey={(r) => r.attendance_id} emptyMessage="No attendance marked yet for this session." />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
