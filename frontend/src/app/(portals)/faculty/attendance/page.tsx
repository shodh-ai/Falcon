'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, BookOpen, Check, Send, X } from 'lucide-react';
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

type MissingAttendanceAlert = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  start_time: string;
  end_time: string;
  student_count: number;
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

type UiStatus = 'PRESENT' | 'ABSENT';

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function MarkAttendanceContent() {
  const api = useAuthedApi();
  const params = useSearchParams();
  const initialCourseId = params.get('courseId');
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [missingAlerts, setMissingAlerts] = useState<MissingAttendanceAlert[]>([]);
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
    void api
      .get<FacultyClass[]>('/api/academics/faculty/timetable/today')
      .then(async (data) => {
        const missing = await api.get<MissingAttendanceAlert[]>('/api/academics/faculty/attendance/missing').catch(() => []);
        const assignedCourseIds = new Set(data.map((c) => c.course_id));
        const relevantMissing = missing.filter((alert) => assignedCourseIds.has(alert.course_id));
        setClasses(data);
        setMissingAlerts(relevantMissing);
        if (data.length === 0) {
          setSelectedCourseId(null);
          return;
        }
        const fromUrl = initialCourseId
          ? data.find((c) => c.course_id === initialCourseId)
          : undefined;
        const pick = fromUrl ?? data[0];
        setSelectedCourseId(pick.course_id);
        setSelectedTimetableId(pick.timetable_id);
      })
      .finally(() => setLoading(false));
  }, [api, initialCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    setRosterLoading(true);
    const timetableId = selectedTimetableId ?? selectedClass?.timetable_id;
    (async () => {
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
        if (cancelled) return;
        setStudents(roster);
        setAnalytics(courseAnalytics);
        setLocked(state.locked);
        const map: Record<string, UiStatus> = {};
        for (const s of roster) map[s.student_id] = 'PRESENT';
        for (const row of state.attendance_data ?? []) {
          if (row.status === 'PRESENT' || row.status === 'ABSENT') map[row.student_id] = row.status;
        }
        setAttendance(map);
        setSearchQuery('');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load roster');
        setStudents([]);
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
    const payload = Object.entries(attendance).map(([student_id, status]) => ({ student_id, status }));
    if (payload.length === 0) {
      toast.error('Mark at least one student before saving.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ saved: number; attendance_updated?: { attendance_percent: string }[] }>(
        '/api/academics/faculty/attendance',
        {
          course_id: selectedCourseId,
          date: selectedDate,
          timetable_id: selectedTimetableId ?? selectedClass?.timetable_id,
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
      setMissingAlerts((prev) => prev.filter((row) => row.course_id !== selectedCourseId));
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
        description="Select today's class, mark present or absent, then log the lecture in your class logbook."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/faculty/logbook">
              <BookOpen className="mr-1.5 h-4 w-4" />
              Open logbook
            </Link>
          </Button>
        }
      />

      {missingAlerts.length > 0 ? (
        <div className="sticky top-3 z-20 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-950 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
              <div>
                <p className="font-bold">ACTION REQUIRED: Unmarked attendance</p>
                <p className="text-sm">
                  You have unmarked attendance for {missingAlerts[0].course_code} from{' '}
                  {String(missingAlerts[0].start_time).slice(0, 5)} today.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setSelectedCourseId(missingAlerts[0].course_id);
                setSelectedTimetableId(missingAlerts[0].timetable_id);
                setSelectedDate(todayIso());
              }}
            >
              Click here to mark now
            </Button>
          </div>
        </div>
      ) : null}

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
                {analytics ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <FacultyMetricChip
                        label="Sessions scheduled"
                        value={`${analytics.health.scheduled_classes}`}
                      />
                      <FacultyMetricChip
                        label="Attendance marked"
                        value={`${analytics.health.conducted_classes}`}
                        emphasis
                      />
                      <FacultyMetricChip
                        label="Avg attendance"
                        value={`${analytics.health.average_attendance_percent}%`}
                      />
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
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
                  </div>
                ) : null}

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
