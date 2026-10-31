'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AttendanceWindow } from '@/components/faculty/AttendanceWindow';
import { AttendanceReopeningPanel } from '@/components/faculty/AttendanceReopeningPanel';
import { BookOpen, Check, Send, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyPanel,
  FacultyEmptyState,
  FacultyInlineLoading,
  FacultyMetricChip,
  FacultyErrorBanner,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { downloadAuthedFile } from '@/lib/hod-download';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import { AttendanceWeekNavigator } from '@/components/faculty/AttendanceWeekNavigator';
import {
  completeAttendancePayload,
  initializeAttendanceForm,
  type AttendanceFormStatus,
} from '@/lib/faculty/attendance-form';

/**
 * The attendance form deliberately starts every student as ABSENT.  A blank
 * or PRESENT default is unsafe because an unreviewed student would silently
 * receive credit for attending.  LEAVE is the faculty-facing label for the
 * academic EXCUSED status persisted by the API.
 */
type UiStatus = AttendanceFormStatus;

type FacultyClass = {
  timetable_id: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  start_time: string;
  end_time: string;
  student_count: number;
  section?: string | null;
  is_practical?: boolean;
  has_saved_attendance?: boolean;
  attendance_locked?: boolean;
  awaiting_confirmation?: boolean;
  cancelled?: boolean;
  event_exemption?: {event_title:string;event_id:string} | null;
};

function isExtraClass(slotId: string | null | undefined) {
  return Boolean(slotId?.startsWith('extra:'));
}

type AttendanceState = {
  locked: boolean;
  attendance_data: { student_id: string; status: UiStatus }[] | null;
  marking_deadline?: string;
  reopened_until?: string;
};

type Student = {
  student_id: string;
  name: string;
  roll_number: string;
  section_code?: string | null;
};

type PracticalBatch = {
  section_code: string;
  revision: number;
  students: (Student & { selected: boolean; assigned_batch: string | null })[];
};

type PracticalBatchSlot = {
  course_id: string;
  course_code: string;
  course_name: string;
  section: string;
  timetable_id: string;
  scheduled_days: string;
};

type AttendanceAnalytics = {
  health: {
    scheduled_classes: number;
    conducted_classes: number;
    average_attendance_percent: number;
  };
  defaulters: {
    student_user_id: string;
    name: string;
    roll_number: string;
    attendance_percent: string;
  }[];
  habitual_absentees: {
    student_user_id: string;
    name: string;
    roll_number: string;
    missed_count: number;
  }[];
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function MarkAttendanceContent() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const teachingPrefix = usePathname()?.startsWith('/hod/my-teaching/') ? '/hod/my-teaching' : '/faculty';
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const params = useSearchParams();
  const initialCourseId = params.get('courseId');
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [unmappedCourseStudents, setUnmappedCourseStudents] = useState<Student[]>([]);
  const [analytics, setAnalytics] = useState<AttendanceAnalytics | null>(null);
  const [attendance, setAttendance] = useState<Record<string, UiStatus>>({});
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [attendanceRevision, setAttendanceRevision] = useState(0);
  const [locked, setLocked] = useState(false);
  const [markingDeadline, setMarkingDeadline] = useState<string | null>(null);
  const [reopenedUntil, setReopenedUntil] = useState<string | null>(null);
  const [exportingAverage, setExportingAverage] = useState(false);
  const [hasSavedAttendance, setHasSavedAttendance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [classesError, setClassesError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [batchEditorOpen, setBatchEditorOpen] = useState(false);
  const [batchRoster, setBatchRoster] = useState<PracticalBatch | null>(null);
  const [batchSlots, setBatchSlots] = useState<PracticalBatchSlot[]>([]);
  const [batchSlotsError, setBatchSlotsError] = useState<string | null>(null);
  const [batchTarget, setBatchTarget] = useState<PracticalBatchSlot | null>(null);
  const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [rosterRefresh, setRosterRefresh] = useState(0);

  useEffect(() => {
    if (deptLoading) return;
    let cancelled = false;
    void api.get<PracticalBatchSlot[]>(withTeachingDeptId('/api/academics/faculty/practical-batches', activeDeptId))
      .then((slots) => {
        if (!cancelled) {
          setBatchSlots(Array.isArray(slots) ? slots : []);
          setBatchSlotsError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBatchSlots([]);
          setBatchSlotsError(error instanceof Error ? error.message : 'Could not load practical batches');
        }
      });
    return () => { cancelled = true; };
  }, [api, activeDeptId, deptLoading]);

  const selectedClass = useMemo(
    () =>
      (selectedTimetableId
        ? classes.find((c) => c.timetable_id === selectedTimetableId)
        : undefined) ??
      classes.find((c) => c.course_id === selectedCourseId) ??
      null,
    [classes, selectedCourseId, selectedTimetableId],
  );

  const filteredStudents = useMemo(
    () => {
      const query = searchQuery.trim().toLowerCase();
      return students.filter((s) => {
        const matchesSearch =
          !query ||
          s.name.toLowerCase().includes(query) ||
          s.roll_number?.toLowerCase().includes(query);
        return matchesSearch;
      });
    },
    [students, searchQuery],
  );

  const presentCount = useMemo(
    () => students.filter((s) => attendance[s.student_id] === 'PRESENT' || attendance[s.student_id] === 'LATE').length,
    [students, attendance],
  );
  const absentCount = useMemo(
    () => students.filter((s) => attendance[s.student_id] === 'ABSENT').length,
    [students, attendance],
  );
  const leaveCount = useMemo(
    () => students.filter((s) => attendance[s.student_id] === 'LEAVE').length,
    [students, attendance],
  );

  useEffect(() => {
    if (deptLoading) return;
    let cancelled = false;
    void api
      .get<FacultyClass[]>(withTeachingDeptId(`/api/academics/faculty/timetable/today?date=${selectedDate}`, activeDeptId))
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) throw new Error('Timetable API returned an invalid response');
        setClassesError(null);
        setClasses(data);
        const selectable = data.filter(c => !c.awaiting_confirmation && !c.cancelled);
        if (selectable.length === 0) {
          setSelectedCourseId(null);
          setSelectedTimetableId(null);
          setStudents([]);
          setUnmappedCourseStudents([]);
          return;
        }
        const fromUrl = initialCourseId
          ? selectable.find((c) => c.course_id === initialCourseId)
          : undefined;
        const pick = fromUrl ?? selectable[0]!;
        setSelectedCourseId(pick.course_id);
        setSelectedTimetableId(pick.timetable_id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setClasses([]);
        setSelectedCourseId(null);
        setSelectedTimetableId(null);
        setStudents([]);
        setUnmappedCourseStudents([]);
        setClassesError(error instanceof Error ? error.message : 'Failed to load classes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, initialCourseId, activeDeptId, deptLoading, selectedDate]);

  useEffect(() => {
    if (!selectedCourseId) return;
    if (selectedClass?.cancelled || selectedClass?.event_exemption) {
      setStudents([]);
      setUnmappedCourseStudents([]);
      setRosterLoading(false);
      setRosterError(null);
      return;
    }
    let cancelled = false;
    const timetableId = selectedTimetableId ?? selectedClass?.timetable_id;

    function applyRoster(
      rosterResolved: Student[],
      stateResolved: AttendanceState,
      analyticsResolved: AttendanceAnalytics | null,
      unmappedResolved: Student[],
    ) {
      if (cancelled) return;
      setStudents(rosterResolved);
      setUnmappedCourseStudents(unmappedResolved);
      setAnalytics(analyticsResolved);
      setLocked(Boolean(stateResolved.locked));
      setMarkingDeadline(stateResolved.marking_deadline ?? null);
      setReopenedUntil(stateResolved.reopened_until ?? null);
      setHasSavedAttendance(Boolean(stateResolved.attendance_data?.length));
      setAttendance(
        stateResolved.locked && !stateResolved.attendance_data?.length
          ? {}
          : initializeAttendanceForm(rosterResolved, stateResolved.attendance_data),
      );
      setSearchQuery('');
    }

    (async () => {
      setRosterLoading(true);
      setRosterError(null);
      setUnmappedCourseStudents([]);
      try {
        const timetableQuery = timetableId ? `&timetableId=${timetableId}` : '';
        const [roster, state] = await Promise.all([
          api.get<Student[]>(
            `/api/academics/faculty/course/${selectedCourseId}/students?date=${selectedDate}${timetableQuery}`,
          ),
          api.get<AttendanceState>(
            `/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}${timetableQuery}`,
          ),
        ]);
        const courseAnalytics = await api
          .get<AttendanceAnalytics>(
            `/api/academics/faculty/course/${selectedCourseId}/attendance/analytics?date=${selectedDate}${timetableId ? `&timetableId=${encodeURIComponent(timetableId)}` : ''}`,
          )
          .catch(() => null);
        if (!Array.isArray(roster)) throw new Error('Student roster API returned an invalid response');
        if (!state || typeof state !== 'object') throw new Error('Attendance API returned an invalid response');
        const unmapped = selectedClass?.is_practical && roster.length === 0
          ? await api.get<Student[]>(`/api/academics/faculty/course/${selectedCourseId}/students`).catch(() => [])
          : [];
        applyRoster(roster, state, courseAnalytics, Array.isArray(unmapped) ? unmapped : []);
      } catch (error: unknown) {
        if (!cancelled) {
          setStudents([]);
          setUnmappedCourseStudents([]);
          setRosterError(error instanceof Error ? error.message : 'Failed to load roster');
        }
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, selectedCourseId, selectedDate, selectedTimetableId, selectedClass?.timetable_id, selectedClass?.is_practical, selectedClass?.cancelled, selectedClass?.event_exemption, rosterRefresh]);

  async function openBatchEditor(target: PracticalBatchSlot) {
    setBatchTarget(target);
    setBatchError(null);
    setBatchRoster(null);
    setBatchEditorOpen(true);
    document.getElementById('practical-batch-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const batch = await api.get<PracticalBatch>(
        `/api/academics/faculty/course/${target.course_id}/practical-batch?timetableId=${encodeURIComponent(target.timetable_id)}`,
      );
      setBatchRoster(batch);
      setBatchSelection(batch.students.filter((student) => student.selected).map((student) => student.student_id));
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Could not load practical batch');
    }
  }

  async function saveBatchRoster() {
    if (!batchTarget || !batchRoster) return;
    setBatchSaving(true);
    setBatchError(null);
    try {
      await api.put(
        `/api/academics/faculty/course/${batchTarget.course_id}/practical-batch?timetableId=${encodeURIComponent(batchTarget.timetable_id)}`,
        { student_ids: batchSelection },
        { 'If-Match': String(batchRoster.revision) },
      );
      setBatchEditorOpen(false);
      setBatchRoster(null);
      setRosterRefresh((value) => value + 1);
      setClasses((current) => current.map((entry) =>
        entry.course_id === batchTarget.course_id && entry.section === batchTarget.section
          ? { ...entry, student_count: batchSelection.length }
          : entry,
      ));
      toast.success('Practical batch saved. It will be reused for future sessions.');
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Could not save practical batch');
    } finally {
      setBatchSaving(false);
    }
  }

  async function copyPreviousAttendance() {
    if (!selectedCourseId || !selectedTimetableId || locked) return;

    try {
      const prev = await api.get<{ attendance_data: { student_id: string; status: UiStatus }[] | null }>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance/previous-session?date=${selectedDate}&timetableId=${selectedTimetableId}`,
      );
      if (!prev.attendance_data?.length) {
        toast.error('No previous session attendance found for this batch today.');
        return;
      }
      setAttendance(initializeAttendanceForm(students, prev.attendance_data));
      toast.success('Copied attendance from previous hour');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not copy previous attendance');
    }
  }

  function markAll(status: UiStatus) {
    if (locked) return;
    setAttendance((current) => {
      const next = { ...current };
      for (const s of filteredStudents) next[s.student_id] = status;
      return next;
    });
  }

  async function downloadAverageAttendance() {
    if (!token || !selectedCourseId || !selectedTimetableId || !selectedClass) {
      toast.error("Select a class and sign in before downloading the report.");
      return;
    }
    setExportingAverage(true);
    try {
      const safeCode = selectedClass.course_code.replace(
        /[^A-Za-z0-9_-]+/g,
        "-",
      );
      await downloadAuthedFile(
        `/api/academics/faculty/course/${encodeURIComponent(selectedCourseId)}/attendance/average-export?date=${encodeURIComponent(selectedDate)}&timetableId=${encodeURIComponent(selectedTimetableId)}`,
        token,
        `average-attendance-${safeCode}-${selectedDate}.xlsx`,
      );
      toast.success("Average attendance Excel downloaded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not download attendance Excel.",
      );
    } finally {
      setExportingAverage(false);
    }
  }


  async function save() {
    if (!selectedCourseId || rosterLoading || locked) return;
    if (selectedClass?.cancelled) {
      toast.error('This class was cancelled. Attendance cannot be recorded.');
      return;
    }
    if (students.length === 0) {
      toast.error('No students on the roster — cannot save attendance.');
      return;
    }
    const payload = completeAttendancePayload(students, attendance);
    if (payload.length === 0) {
      toast.error('Mark at least one student before saving.');
      return;
    }
    setSaving(true);
    try {
      const timetableId = selectedTimetableId ?? selectedClass?.timetable_id;

      const result = await api.post<{ saved: number; attendance_updated?: { attendance_percent: string }[] }>(
        '/api/academics/faculty/attendance',
        {
          course_id: selectedCourseId,
          date: selectedDate,
          timetable_id: timetableId,
          attendance_data: payload,
        },
      );
      const state = await api.get<AttendanceState>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}${timetableId ? `&timetableId=${encodeURIComponent(timetableId)}` : ''}`,
      );
      setLocked(state.locked);
      setMarkingDeadline(state.marking_deadline ?? null);
      setReopenedUntil(state.reopened_until ?? null);
      setHasSavedAttendance(true);
      setAttendanceRevision(value => value + 1);
      setClasses(rows => rows.map(row => row.timetable_id === timetableId && row.course_id === selectedCourseId
        ? { ...row, has_saved_attendance: true, attendance_locked: state.locked } : row));
      const saved = result.saved ?? payload.length;
      if ((result.attendance_updated?.length ?? 0) === 0) {
        toast.warning(`Attendance saved for ${saved} student${saved === 1 ? '' : 's'} in this class, but enrollment percentages could not be refreshed.`);
      } else {
        toast.success(`Attendance saved for ${saved} student${saved === 1 ? '' : 's'} in this class.`);
      }
      const courseAnalytics = await api
        .get<AttendanceAnalytics>(
          `/api/academics/faculty/course/${selectedCourseId}/attendance/analytics?date=${selectedDate}${timetableId ? `&timetableId=${encodeURIComponent(timetableId)}` : ''}`,
        )
        .catch(() => null);
      setAnalytics(courseAnalytics);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sendWarnings() {
    if (!selectedCourseId || !selectedTimetableId || !analytics?.defaulters.length) return;

    try {
      const result = await api.post<{ notified: number }>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance/warnings`,
        { student_ids: analytics.defaulters.map((row) => row.student_user_id),
          date: selectedDate, timetable_id: selectedTimetableId },
      );
      toast.success(`Warning sent to ${result.notified} student${result.notified === 1 ? '' : 's'} and linked parents`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Warning failed');
    }
  }

  if (loading) {
    return <FacultyPageLoading label="Loading attendance…" branded />;
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Attendance"
        description="Mark and review student attendance records."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`${teachingPrefix}/logbook`}>
              <BookOpen className="mr-1.5 h-4 w-4" />
              Open logbook
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <label htmlFor="faculty-attendance-date" className="text-sm font-medium text-sgvu-navy">
          Class date
        </label>
        <input
          id="faculty-attendance-date"
          type="date"
          max={todayIso()}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={selectedDate}
          onChange={(e) => {
            if (!e.target.value) return;
            setLoading(true);
            setClassesError(null);
            setSelectedDate(e.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Select a scheduled date to mark attendance or review a locked record.
        </p>
      </div>

      <AttendanceWeekNavigator selectedDate={selectedDate} today={todayIso()} deptId={activeDeptId}
        scopeLoading={deptLoading} revision={attendanceRevision} onSelect={date => {
          if (date === selectedDate) return;
          setLoading(true);
          setClassesError(null);
          setSelectedDate(date);
        }} />

      {batchSlotsError ? <FacultyErrorBanner message={`Practical batch setup: ${batchSlotsError}`} /> : null}
      {batchSlots.length > 0 ? (
        <section id="practical-batch-setup">
        <FacultyPanel title="Practical batch setup" description="Create each roster once and edit it any day, independently of attendance dates.">
          <div className="flex flex-wrap gap-2">
            {batchSlots.map((slot) => (
              <Button
                key={`${slot.course_id}:${slot.section}`}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void openBatchEditor(slot)}
              >
                {slot.course_code} · {slot.section}
              </Button>
            ))}
          </div>
          {batchEditorOpen && batchTarget ? (
            <div className="mt-3 space-y-3 rounded-lg border bg-background p-3 text-sm">
              <p className="font-medium text-sgvu-navy">
                {batchRoster?.revision ? 'Edit' : 'Create'} {batchTarget.course_code} · {batchTarget.section} roster
              </p>
              <p className="text-xs text-muted-foreground">
                Choose enrolled students for this practical batch. Saved attendance for earlier sessions will not change.
              </p>
              {batchError ? <FacultyErrorBanner message={batchError} /> : null}
              {!batchRoster && !batchError ? <FacultyInlineLoading label="Loading course students…" /> : null}
              {batchRoster ? (
                <>
                  <div className="max-h-72 space-y-1 overflow-auto">
                    {batchRoster.students.length === 0 ? <p>No enrolled students are available for this course.</p> : null}
                    {batchRoster.students.map((student) => (
                      <label key={student.student_id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={batchSelection.includes(student.student_id)}
                          disabled={Boolean(student.assigned_batch && student.assigned_batch !== batchRoster.section_code)}
                          onChange={(event) => setBatchSelection((current) => event.target.checked
                            ? [...current, student.student_id]
                            : current.filter((id) => id !== student.student_id))}
                        />
                        <span>{student.name} · {student.roll_number}</span>
                        {student.assigned_batch && student.assigned_batch !== batchRoster.section_code
                          ? <span className="text-xs text-muted-foreground">Assigned to {student.assigned_batch}</span>
                          : null}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void saveBatchRoster()} disabled={batchSaving}>
                      {batchSaving ? 'Saving…' : 'Save batch roster'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setBatchEditorOpen(false)}>Cancel</Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </FacultyPanel>
        </section>
      ) : null}

      {classesError ? <FacultyErrorBanner message={classesError} /> : null}
      {!classesError && classes.length === 0 ? (
        <FacultyEmptyState
          title="No classes on this date"
          description="Select another scheduled class date to review or mark attendance."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <FacultyPanel title="Classes on selected date" count={classes.length}>
            <ul className="space-y-1.5">
              {classes.map((c) => {
                const active = selectedTimetableId === c.timetable_id;
                return (
                  <li key={c.timetable_id}>
                    <button
                      type="button"
                      disabled={c.awaiting_confirmation}
                      onClick={() => {
                        setRosterLoading(true);
                        setStudents([]);
                        setAnalytics(null);
                        setSelectedCourseId(c.course_id);
                        setSelectedTimetableId(c.timetable_id);
                      }}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                        active
                          ? 'border-sgvu-gold/60 bg-sgvu-gold/10 ring-1 ring-sgvu-gold/40'
                          : 'border-border/60 bg-background hover:border-sgvu-gold/30 hover:bg-muted/40',
                      )}
                    >
                      <p className="font-semibold text-sgvu-navy">{c.course_code}</p>
                      {c.event_exemption ? <Badge className="ml-2 bg-teal-700">Event exempted</Badge> : null}
                      {c.cancelled ? <Badge variant="destructive" className="ml-2">Cancelled</Badge> : null}
                      {isExtraClass(c.timetable_id) ? <span className="text-xs font-semibold text-amber-800">Approved extra class</span> : null}
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.course_name}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {String(c.start_time).slice(0, 5)}–{String(c.end_time).slice(0, 5)} · {c.student_count} students
                      </p>
                      <p className={cn('mt-2 text-xs font-medium', c.has_saved_attendance ? 'text-emerald-700' : 'text-amber-800')}>
                        {c.event_exemption ? 'Event coordinator records attendance' : c.cancelled ? 'No attendance needed · class cancelled' : c.awaiting_confirmation ? 'Awaiting department confirmation' : c.has_saved_attendance === true ? 'Attendance recorded'
                          : c.has_saved_attendance === false ? c.attendance_locked ? 'Not recorded · date locked' : 'Attendance pending'
                          : 'Attendance status unavailable'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </FacultyPanel>

          <FacultyPanel
            title={selectedClass ? `${selectedClass.course_code} — roster` : 'Student roster'}
            description={selectedClass ? `${selectedClass.room ?? 'Room TBA'} · ${rosterLoading ? 'Loading roster' : `${students.length} in this class`}` : undefined}
          >
            {!selectedClass ? (
              <FacultyEmptyState description="Select a class from the list to load the roster." />
            ) : selectedClass.event_exemption ? (
              <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">Exempted for event: {selectedClass.event_exemption.event_title}. Workload remains counted. The approved coordinator marks attendance in <Link className="underline" href="/faculty/event-attendance">Mark Event Attendance</Link>.</p>
            ) : selectedClass.cancelled ? (
              <p role="status" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                This dated class was cancelled. There is no attendance to mark for this session.
              </p>
            ) : rosterLoading ? (
              <FacultyInlineLoading label="Loading roster…" />
            ) : rosterError ? (
              <FacultyErrorBanner message={rosterError} />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Input
                    type="search"
                    className="sm:max-w-xs"
                    placeholder="Search name or roll no…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <Button variant="outline" disabled={exportingAverage || !token || !selectedTimetableId || rosterLoading} onClick={() => void downloadAverageAttendance()}>
                      {exportingAverage ? 'Exporting…' : 'Export average attendance'}
                    </Button>
                    {locked ? <Badge variant="secondary">Locked · read-only</Badge> : null}
                    <FacultyMetricChip label="Present" value={presentCount} emphasis />
                    <FacultyMetricChip label="Absent" value={absentCount} />
                    <FacultyMetricChip label="Leave" value={leaveCount} />
                  </div>
                </div>

                {selectedClass.is_practical ? (
                  <div className="space-y-3 rounded-lg border bg-muted/30 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p>
                        <span className="font-medium text-sgvu-navy">Practical batch: </span>
                        {selectedClass.section || 'Not named — contact your HOD'}.
                        {' '}Assign students once; the same batch roster is used on future class days.
                      </p>
                      {selectedClass.section && selectedTimetableId ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => void openBatchEditor({
                          course_id: selectedClass.course_id,
                          course_code: selectedClass.course_code,
                          course_name: selectedClass.course_name,
                          section: selectedClass.section!,
                          timetable_id: selectedTimetableId,
                          scheduled_days: '',
                        })}>
                          Create or edit batch
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {!locked && <AttendanceWindow deadline={reopenedUntil || markingDeadline} reopened={Boolean(reopenedUntil)} onExpired={() => setLocked(true)} />}
                {locked && selectedTimetableId && <AttendanceReopeningPanel courseId={selectedCourseId || undefined} sessionKey={selectedTimetableId} date={selectedDate} />}
                {locked && !hasSavedAttendance ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    This date is locked and no attendance was recorded for this session. Students are not counted as absent.
                  </p>
                ) : null}

                {!locked && students.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => markAll('PRESENT')}>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      All present
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => markAll('ABSENT')}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      All absent
                    </Button>
                    {!isExtraClass(selectedTimetableId) ? <Button type="button" size="sm" variant="secondary" onClick={() => void copyPreviousAttendance()}>
                      Take Same Attendance as Previous
                    </Button> : null}
                  </div>
                )}

                {students.length === 0 ? (
                  <div className="space-y-3">
                    <FacultyEmptyState description={selectedClass.is_practical
                      ? 'No students are assigned to this practical batch. Use Create or edit batch to select enrolled students before marking attendance.'
                      : 'No students on the roster for this course.'} />
                    {unmappedCourseStudents.length > 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                        <p className="font-medium text-amber-950">Course students · read-only</p>
                        <p className="mt-1 text-amber-900">
                          These {unmappedCourseStudents.length} students are enrolled in the course but are not confirmed for this practical batch.
                        </p>
                        <ul className="mt-2 max-h-48 overflow-auto text-amber-950">
                          {unmappedCourseStudents.map((student) => (
                            <li key={student.student_id}>{student.name} · {student.roll_number}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No students match &ldquo;{searchQuery}&rdquo;.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <ul className="divide-y divide-border/50">
                      {filteredStudents.map((s) => (
                        <li
                          key={s.student_id}
                          className="flex flex-col gap-2 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sgvu-navy">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.roll_number || 'No roll number'}</p>
                          </div>
                          {locked ? (
                            <Badge variant="secondary" className="self-start sm:self-auto">
                              {attendance[s.student_id] === 'LEAVE'
                                ? 'Leave'
                                : attendance[s.student_id]
                                  ? attendance[s.student_id].toLowerCase()
                                  : 'Not recorded'}
                            </Badge>
                          ) : (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              size="sm"
                              className="min-w-[5.5rem]"
                              variant={attendance[s.student_id] === 'PRESENT' ? 'default' : 'outline'}
                              disabled={locked}
                              onClick={() => setAttendance((a) => ({ ...a, [s.student_id]: 'PRESENT' }))}
                            >
                              Present
                            </Button>
                            <Button
                              size="sm"
                              className="min-w-[5.5rem]"
                              variant={attendance[s.student_id] === 'ABSENT' ? 'destructive' : 'outline'}
                              disabled={locked}
                              onClick={() => setAttendance((a) => ({ ...a, [s.student_id]: 'ABSENT' }))}
                            >
                              Absent
                            </Button>
                            <Button
                              size="sm"
                              className="min-w-[5.5rem]"
                              variant={attendance[s.student_id] === 'LEAVE' ? 'secondary' : 'outline'}
                              disabled={locked}
                              onClick={() => setAttendance((a) => ({ ...a, [s.student_id]: 'LEAVE' }))}
                            >
                              Leave
                            </Button>
                          </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {locked && !hasSavedAttendance
                      ? 'No saved attendance for this locked session.'
                      : students.length > 0
                      ? `${presentCount} present · ${absentCount} absent · ${leaveCount} leave · ${students.length} in scheduled roster (${filteredStudents.length} shown)`
                      : 'Save syncs attendance to enrollment percentages.'}
                  </p>
                  <Button
                    className="sm:min-w-[10rem]"
                    disabled={locked || saving || rosterLoading || students.length === 0}
                    onClick={() => void save()}
                  >
                    {saving ? 'Saving…' : 'Save attendance'}
                  </Button>
                </div>

                {analytics ? (
                  <div className="grid gap-4 border-t border-border/50 pt-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-red-200 bg-red-50/80 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-red-950">Danger Zone: Below 75%</p>
                          <p className="text-xs text-red-900/80">Below 75% in this selected class only</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={analytics.defaulters.length === 0 || isExtraClass(selectedTimetableId)}
                          onClick={() => void sendWarnings()}
                          className="gap-1.5"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send Warning Alert
                        </Button>
                      </div>
                      {analytics.defaulters.length === 0 ? (
                        <p className="text-sm text-red-900/80">No student is below 75%.</p>
                      ) : (
                        <div className="max-h-48 overflow-auto rounded-lg border border-red-200 bg-background">
                          <table className="w-full text-xs">
                            <tbody>
                              {analytics.defaulters.map((row) => (
                                <tr key={row.student_user_id} className="border-b last:border-0">
                                  <td className="px-2 py-1.5 font-medium text-sgvu-navy">{row.name}</td>
                                  <td className="px-2 py-1.5 text-muted-foreground">{row.roll_number}</td>
                                  <td className="px-2 py-1.5 text-right font-bold text-red-700">
                                    {Number(row.attendance_percent).toFixed(2)}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-sm font-bold text-amber-950">Habitual Absentees</p>
                      <p className="mb-2 text-xs text-amber-900/80">Missed the last 3 consecutive classes</p>
                      {analytics.habitual_absentees.length === 0 ? (
                        <p className="text-sm text-amber-900/80">No habitual absentees in the last 3 classes.</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {analytics.habitual_absentees.map((row) => (
                            <li key={row.student_user_id} className="rounded-lg border bg-background px-3 py-2">
                              <span className="font-medium text-sgvu-navy">{row.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{row.roll_number}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </FacultyPanel>
        </div>
      )}
    </FacultyPageShell>
  );
}

export default function FacultyAttendancePage() {
  return (
    <Suspense fallback={<FacultyPageLoading label="Loading attendance…" branded />}>
      <MarkAttendanceContent />
    </Suspense>
  );
}
