'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoAttendanceAnalytics,
  facultyDemoAttendanceState,
  facultyDemoCourseStudents,
  facultyDemoTodayClasses,
} from '@/lib/mock/faculty-portal-demo';

type UiStatus = 'PRESENT' | 'ABSENT';

function demoAttendanceStorageKey(
  courseId: string,
  date: string,
  timetableId: string | null | undefined,
) {
  return `falcon-faculty-demo-attendance:${courseId}:${date}:${timetableId ?? 'none'}`;
}

function readDemoAttendance(
  courseId: string,
  date: string,
  timetableId: string | null | undefined,
): { locked: boolean; attendance_data: { student_id: string; status: UiStatus }[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(demoAttendanceStorageKey(courseId, date, timetableId));
    if (!raw) return null;
    return JSON.parse(raw) as {
      locked: boolean;
      attendance_data: { student_id: string; status: UiStatus }[];
    };
  } catch {
    return null;
  }
}

function writeDemoAttendance(
  courseId: string,
  date: string,
  timetableId: string | null | undefined,
  payload: { locked: boolean; attendance_data: { student_id: string; status: UiStatus }[] },
) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      demoAttendanceStorageKey(courseId, date, timetableId),
      JSON.stringify(payload),
    );
  } catch {
    // ignore quota / private mode
  }
}

type FacultyClass = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  start_time: string;
  end_time: string;
  student_count: number;
};

type Student = {
  student_id: string;
  name: string;
  roll_number: string;
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
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const params = useSearchParams();
  const initialCourseId = params.get('courseId');
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [analytics, setAnalytics] = useState<AttendanceAnalytics | null>(null);
  const [attendance, setAttendance] = useState<Record<string, UiStatus>>({});
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedClass = useMemo(
    () => classes.find((c) => c.timetable_id === selectedTimetableId) ?? classes.find((c) => c.course_id === selectedCourseId) ?? null,
    [classes, selectedCourseId, selectedTimetableId],
  );

  const filteredStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          !searchQuery.trim() ||
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.roll_number?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [students, searchQuery],
  );

  const presentCount = useMemo(
    () => students.filter((s) => attendance[s.student_id] === 'PRESENT').length,
    [students, attendance],
  );
  const absentCount = useMemo(
    () => students.filter((s) => attendance[s.student_id] === 'ABSENT').length,
    [students, attendance],
  );

  useEffect(() => {
    if (deptLoading) return;
    void api
      .get<FacultyClass[]>(withTeachingDeptId('/api/academics/faculty/timetable/today', activeDeptId))
      .then((data) => {
        const classesResolved = withFacultyDemoFallback(data, facultyDemoTodayClasses(), isEmptyArray);
        setClasses(classesResolved);
        if (classesResolved.length === 0) {
          setSelectedCourseId(null);
          return;
        }
        const fromUrl = initialCourseId
          ? classesResolved.find((c) => c.course_id === initialCourseId)
          : undefined;
        const pick = fromUrl ?? classesResolved[0]!;
        setSelectedCourseId(pick.course_id);
        setSelectedTimetableId(pick.timetable_id);
      })
      .catch(() => {
        const classesResolved = withFacultyDemoFallback([], facultyDemoTodayClasses(), isEmptyArray);
        setClasses(classesResolved);
        if (classesResolved[0]) {
          setSelectedCourseId(classesResolved[0].course_id);
          setSelectedTimetableId(classesResolved[0].timetable_id);
        }
      })
      .finally(() => setLoading(false));
  }, [api, initialCourseId, activeDeptId, deptLoading]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    setRosterLoading(true);
    const timetableId = selectedTimetableId ?? selectedClass?.timetable_id;

    function applyRoster(
      rosterResolved: Student[],
      stateResolved: { locked: boolean; attendance_data: { student_id: string; status: UiStatus }[] | null },
      analyticsResolved: AttendanceAnalytics | null,
    ) {
      if (cancelled) return;
      setStudents(rosterResolved);
      setAnalytics(analyticsResolved);
      setLocked(Boolean(stateResolved.locked));
      const map: Record<string, UiStatus> = {};
      for (const s of rosterResolved) map[s.student_id] = 'PRESENT';
      for (const row of stateResolved.attendance_data ?? []) {
        if (row.status === 'PRESENT' || row.status === 'ABSENT') map[row.student_id] = row.status;
      }
      setAttendance(map);
      setSearchQuery('');
    }

    (async () => {
      // Smoke course IDs are not in Postgres — never call the API (avoids 500 noise).
      if (isFacultyDemoSmokeId(selectedCourseId)) {
        const rosterResolved = facultyDemoCourseStudents(selectedCourseId);
        const stored = readDemoAttendance(selectedCourseId, selectedDate, timetableId);
        const stateResolved = stored ?? facultyDemoAttendanceState(selectedCourseId);
        applyRoster(
          rosterResolved,
          stateResolved,
          facultyDemoAttendanceAnalytics(selectedCourseId),
        );
        if (!cancelled) setRosterLoading(false);
        return;
      }

      try {
        const timetableQuery = timetableId ? `&timetableId=${timetableId}` : '';
        const [roster, state] = await Promise.all([
          api.get<Student[]>(`/api/academics/faculty/course/${selectedCourseId}/students`),
          api.get<{ locked: boolean; attendance_data: { student_id: string; status: UiStatus }[] | null }>(
            `/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}${timetableQuery}`,
          ),
        ]);
        const courseAnalytics = await api
          .get<AttendanceAnalytics>(
            `/api/academics/faculty/course/${selectedCourseId}/attendance/analytics?date=${selectedDate}`,
          )
          .catch(() => null);
        const rosterResolved = withFacultyDemoFallback(
          roster,
          facultyDemoCourseStudents(selectedCourseId),
          isEmptyArray,
        );
        const stateResolved = withFacultyDemoFallback(
          state,
          facultyDemoAttendanceState(selectedCourseId),
          (v) => !v?.attendance_data?.length,
        );
        applyRoster(
          rosterResolved,
          stateResolved,
          withFacultyDemoFallback(
            courseAnalytics,
            facultyDemoAttendanceAnalytics(selectedCourseId),
          ),
        );
      } catch (e) {
        const rosterResolved = withFacultyDemoFallback(
          [],
          facultyDemoCourseStudents(selectedCourseId),
          isEmptyArray,
        );
        if (rosterResolved.length === 0) {
          toast.error(e instanceof Error ? e.message : 'Failed to load roster');
        }
        applyRoster(
          rosterResolved,
          facultyDemoAttendanceState(selectedCourseId),
          facultyDemoAttendanceAnalytics(selectedCourseId),
        );
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, selectedCourseId, selectedDate, selectedTimetableId, selectedClass?.timetable_id]);

  async function copyPreviousAttendance() {
    if (!selectedCourseId || !selectedTimetableId || locked) return;

    if (isFacultyDemoSmokeId(selectedCourseId)) {
      const map: Record<string, UiStatus> = {};
      students.forEach((s, i) => {
        map[s.student_id] = i % 6 === 0 ? 'ABSENT' : 'PRESENT';
      });
      setAttendance(map);
      toast.success('Copied attendance from previous hour (demo)');
      return;
    }

    try {
      const prev = await api.get<{ attendance_data: { student_id: string; status: UiStatus }[] | null }>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance/previous-session?date=${selectedDate}&timetableId=${selectedTimetableId}`,
      );
      if (!prev.attendance_data?.length) {
        toast.error('No previous session attendance found for this batch today.');
        return;
      }
      const map: Record<string, UiStatus> = {};
      for (const row of prev.attendance_data) {
        if (row.status === 'PRESENT' || row.status === 'ABSENT') map[row.student_id] = row.status;
      }
      setAttendance(map);
      toast.success('Copied attendance from previous hour');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not copy previous attendance');
    }
  }

  function markAll(status: UiStatus) {
    if (locked) return;
    const next: Record<string, UiStatus> = {};
    for (const s of students) next[s.student_id] = status;
    setAttendance(next);
  }

  async function save() {
    if (!selectedCourseId) return;
    if (students.length === 0) {
      toast.error('No students on the roster — cannot save attendance.');
      return;
    }
    const payload = Object.entries(attendance).map(([student_id, status]) => ({
      student_id,
      status,
    })) as { student_id: string; status: UiStatus }[];
    if (payload.length === 0) {
      toast.error('Mark at least one student before saving.');
      return;
    }
    setSaving(true);
    try {
      const timetableId = selectedTimetableId ?? selectedClass?.timetable_id;

      // Demo smoke courses must not hit the backend (IDs are not in the database).
      if (isFacultyDemoSmokeId(selectedCourseId)) {
        writeDemoAttendance(selectedCourseId, selectedDate, timetableId, {
          locked: true,
          attendance_data: payload,
        });
        setLocked(true);
        setAnalytics(facultyDemoAttendanceAnalytics(selectedCourseId));
        toast.success(
          `Attendance saved · ${payload.length} student${payload.length === 1 ? '' : 's'} synced (demo)`,
        );
        return;
      }

      const result = await api.post<{ saved: number; attendance_updated?: { attendance_percent: string }[] }>(
        '/api/academics/faculty/attendance',
        {
          course_id: selectedCourseId,
          date: selectedDate,
          timetable_id: timetableId,
          attendance_data: payload,
        },
      );
      const state = await api.get<{ locked: boolean }>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}`,
      );
      setLocked(state.locked);
      const synced = result.attendance_updated?.length ?? 0;
      if (synced === 0) {
        toast.warning('Attendance saved to session log but no enrollment percentages were updated. Check student IDs.');
      } else {
        toast.success(`Attendance saved · ${synced} student${synced === 1 ? '' : 's'} synced to enrollment %`);
      }
      const courseAnalytics = await api
        .get<AttendanceAnalytics>(
          `/api/academics/faculty/course/${selectedCourseId}/attendance/analytics?date=${selectedDate}`,
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
    if (!selectedCourseId || !analytics?.defaulters.length) return;

    if (isFacultyDemoSmokeId(selectedCourseId)) {
      toast.success(
        `Warning sent to ${analytics.defaulters.length} student${analytics.defaulters.length === 1 ? '' : 's'} and linked parents (demo)`,
      );
      return;
    }

    try {
      const result = await api.post<{ notified: number }>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance/warnings`,
        { student_ids: analytics.defaulters.map((row) => row.student_user_id) },
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
            <Link href="/faculty/logbook">
              <BookOpen className="mr-1.5 h-4 w-4" />
              Open logbook
            </Link>
          </Button>
        }
      />

      {classes.length === 0 ? (
        <FacultyEmptyState
          title="No classes today"
          description="When you have sessions on the timetable, they will appear here for attendance marking."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <FacultyPanel title="Today's classes" count={classes.length}>
            <ul className="space-y-1.5">
              {classes.map((c) => {
                const active = selectedTimetableId === c.timetable_id;
                return (
                  <li key={c.timetable_id}>
                    <button
                      type="button"
                      onClick={() => {
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
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.course_name}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {String(c.start_time).slice(0, 5)}–{String(c.end_time).slice(0, 5)} · {c.student_count} students
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </FacultyPanel>

          <FacultyPanel
            title={selectedClass ? `${selectedClass.course_code} — roster` : 'Student roster'}
            description={selectedClass ? `${selectedClass.room ?? 'Room TBA'} · ${selectedClass.student_count} enrolled` : undefined}
          >
            {!selectedClass ? (
              <FacultyEmptyState description="Select a class from the list to load the roster." />
            ) : rosterLoading ? (
              <FacultyInlineLoading label="Loading roster…" />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <input
                    type="date"
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                  <Input
                    type="search"
                    className="sm:max-w-xs"
                    placeholder="Search name or roll no…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    {locked ? <Badge variant="secondary">Locked</Badge> : null}
                    <FacultyMetricChip label="Present" value={presentCount} emphasis />
                    <FacultyMetricChip label="Absent" value={absentCount} />
                  </div>
                </div>

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
                    <Button type="button" size="sm" variant="secondary" onClick={() => void copyPreviousAttendance()}>
                      Take Same Attendance as Previous
                    </Button>
                  </div>
                )}

                {students.length === 0 ? (
                  <FacultyEmptyState description="No students on the roster for this course." />
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
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {students.length > 0
                      ? `${presentCount} present · ${absentCount} absent · ${students.length} total`
                      : 'Save syncs attendance to enrollment percentages.'}
                  </p>
                  <Button
                    className="sm:min-w-[10rem]"
                    disabled={locked || saving || students.length === 0}
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
                          <p className="text-xs text-red-900/80">Pre-filtered defaulters list</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={analytics.defaulters.length === 0}
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
