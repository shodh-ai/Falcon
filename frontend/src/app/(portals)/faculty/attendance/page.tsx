'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
<<<<<<< Updated upstream
import { BookOpen, Check, X } from 'lucide-react';
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
=======
import { Loader2, Check, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
>>>>>>> Stashed changes
import { useAuthedApi } from '@/lib/api';

type FacultyClass = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
};

type Student = {
  student_id: string;
  name: string;
  roll_number: string;
};

type UiStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

function daysDiff(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.floor((t1 - t2) / (1000 * 60 * 60 * 24));
}

function MarkAttendanceContent() {
  const api = useAuthedApi();
  const params = useSearchParams();
  const initialCourseId = params.get('courseId');
  
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  
  const [students, setStudents] = useState<Student[]>([]);
  // dateStr -> student_id -> status
  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, UiStatus>>>({});
  
  const [windowEndDate, setWindowEndDate] = useState(localDateString());
  const [loading, setLoading] = useState(true);
<<<<<<< Updated upstream
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
=======
  const [fetchingData, setFetchingData] = useState(false);
>>>>>>> Stashed changes

  const selectedClass = useMemo(
    () => classes.find((c) => c.course_id === selectedCourseId) ?? null,
    [classes, selectedCourseId],
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
<<<<<<< Updated upstream
    void api
      .get<FacultyClass[]>('/api/academics/faculty/timetable/today')
      .then((data) => {
        setClasses(data);
        if (data.length === 0) {
          setSelectedCourseId(null);
          return;
        }
        const fromUrl = initialCourseId && data.find((c) => c.course_id === initialCourseId);
        setSelectedCourseId(fromUrl ? fromUrl.course_id : data[0].course_id);
      })
      .finally(() => setLoading(false));
  }, [api, initialCourseId]);
=======
    void api.get<FacultyClass[]>('/api/academics/faculty/workspaces/courses').then(setClasses).finally(() => setLoading(false));
  }, [api]);
>>>>>>> Stashed changes

  useEffect(() => {
    if (!selectedCourseId || !windowEndDate) return;
    const windowMonth = windowEndDate.slice(0, 7);
    let cancelled = false;
<<<<<<< Updated upstream
    setRosterLoading(true);
=======
    setFetchingData(true);
>>>>>>> Stashed changes
    (async () => {
      try {
        const res = await api.get<{
          students: Student[];
          logs: { date: string; attendance_data: { student_id: string; status: UiStatus }[] }[];
        }>(`/api/academics/faculty/course/${selectedCourseId}/attendance/monthly?month=${windowMonth}`);
        if (cancelled) return;
        setStudents(res.students);
        
        const map: Record<string, Record<string, UiStatus>> = {};
        for (const log of res.logs || []) {
          // log.date from db might be "YYYY-MM-DD" or "YYYY-MM-DDT..."
          const dateStr = log.date.split('T')[0];
          map[dateStr] = {};
          for (const item of log.attendance_data || []) {
            map[dateStr][item.student_id] = item.status;
          }
        }
<<<<<<< Updated upstream
        setAttendance(map);
        setSearchQuery('');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load roster');
        setStudents([]);
      } finally {
        if (!cancelled) setRosterLoading(false);
=======
        setAttendanceMap(map);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load attendance');
      } finally {
        if (!cancelled) setFetchingData(false);
>>>>>>> Stashed changes
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, selectedCourseId, windowEndDate]);

<<<<<<< Updated upstream
  function markAll(status: UiStatus) {
    if (locked) return;
    const next: Record<string, UiStatus> = {};
    for (const s of students) next[s.student_id] = status;
    setAttendance(next);
  }

  async function save() {
=======
  const displayDays = useMemo(() => {
    return [addDays(windowEndDate, -2), addDays(windowEndDate, -1), windowEndDate];
  }, [windowEndDate]);

  const handleToggle = async (studentId: string, dateStr: string, currentStatus: string | undefined) => {
>>>>>>> Stashed changes
    if (!selectedCourseId) return;

    const today = localDateString();
    const isLocked = daysDiff(today, dateStr) > 3;

    const newStatus = currentStatus === 'PRESENT' ? 'ABSENT' : 'PRESENT';

    if (isLocked) {
      try {
        await api.post('/api/academics/faculty/attendance/override', {
          course_id: selectedCourseId,
          date: dateStr,
          student_user_id: studentId,
          status: newStatus,
        });
        toast.success('Attendance locked. Sending request to HOD.');
      } catch (e) {
        toast.error('Failed to request attendance override');
      }
      return;
    }
    
    // Optimistic update
    setAttendanceMap((prev) => {
      const dayMap = prev[dateStr] || {};
      return {
        ...prev,
        [dateStr]: { ...dayMap, [studentId]: newStatus },
      };
    });

    try {
      // Build payload for the full day
      const dayMap = attendanceMap[dateStr] || {};
      const updatedDayMap = { ...dayMap, [studentId]: newStatus };
      const payload = Object.entries(updatedDayMap).map(([sId, status]) => ({ student_id: sId, status }));

      await api.post('/api/academics/faculty/attendance', {
        course_id: selectedCourseId,
        date: dateStr,
        attendance_data: payload,
      });
    } catch (e) {
      toast.error('Failed to update attendance');
      // Revert optimistic update
      setAttendanceMap((prev) => {
        const dayMap = { ...prev[dateStr] };
        if (currentStatus) {
          dayMap[studentId] = currentStatus as UiStatus;
        } else {
          delete dayMap[studentId];
        }
        return {
          ...prev,
          [dateStr]: dayMap,
        };
      });
    }
  };

  if (loading) {
    return <FacultyPageLoading label="Loading attendance…" branded />;
  }

  return (
<<<<<<< Updated upstream
    <FacultyPageShell>
      <FacultyPageHeader
        description="Select today's class, mark present or absent, then log the lecture in your class logbook."
=======
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Mark Attendance"
        description="Dedicated attendance workspace — select a class, choose the month, and toggle attendance directly in the grid."
>>>>>>> Stashed changes
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/faculty/logbook">
              <BookOpen className="mr-1.5 h-4 w-4" />
              Open logbook
            </Link>
          </Button>
        }
      />

<<<<<<< Updated upstream
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
                const active = selectedCourseId === c.course_id;
                return (
                  <li key={c.timetable_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCourseId(c.course_id)}
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
=======
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => (
          <Card
            key={c.course_id}
            className={`cursor-pointer transition ${selectedCourseId === c.course_id ? 'ring-2 ring-sgvu-gold' : ''}`}
            onClick={() => setSelectedCourseId(c.course_id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {c.course_code} — {c.course_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {c.credits} Credits
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedClass ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{selectedClass.course_name} — Monthly Roll Call</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWindowEndDate(addDays(windowEndDate, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="rounded-md border px-3 py-2 text-sm font-medium">
                {new Date(addDays(windowEndDate, -2)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                {' - '}
                {new Date(windowEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWindowEndDate(addDays(windowEndDate, 1))}
                disabled={windowEndDate >= localDateString()}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {fetchingData ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : students.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No active students found in this course.
              </div>
            ) : (
              <div className="relative w-full overflow-x-auto rounded-lg border shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[200px] bg-muted/90 px-4 py-3 font-medium backdrop-blur">
                        Student Name
                      </th>
                      <th className="sticky left-[200px] z-20 min-w-[120px] bg-muted/90 px-4 py-3 font-medium backdrop-blur border-r">
                        Roll Number
                      </th>
                      <th className="sticky left-[320px] z-20 min-w-[80px] bg-muted/90 px-4 py-3 font-medium text-center backdrop-blur border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        Present
                      </th>
                      {displayDays.map((d) => {
                        const isToday = d === localDateString();
                        return (
                          <th key={d} className="min-w-[40px] px-2 py-3 text-center font-medium">
                            {isToday ? (
                              <span className="font-bold">Today</span>
                            ) : (
                              new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-background">
                    {students.map((student) => {
                      let totalPresent = 0;
                      // Calculate from attendanceMap for all days loaded in the month
                      Object.values(attendanceMap).forEach((dayMap) => {
                        if (dayMap[student.student_id] === 'PRESENT') {
                          totalPresent++;
                        }
                      });

                      return (
                        <tr key={student.student_id} className="hover:bg-muted/30">
                          <td className="sticky left-0 z-10 bg-background/95 px-4 py-2 font-medium backdrop-blur">
                            {student.name}
                          </td>
                          <td className="sticky left-[200px] z-10 bg-background/95 px-4 py-2 text-muted-foreground backdrop-blur border-r">
                            {student.roll_number}
                          </td>
                          <td className="sticky left-[320px] z-10 bg-background/95 px-4 py-2 text-center font-semibold text-sgvu-navy backdrop-blur border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {totalPresent}
                          </td>
                          {displayDays.map((dateStr) => {
                            const status = attendanceMap[dateStr]?.[student.student_id];
                            const isPresent = status === 'PRESENT';
                            const today = localDateString();
                            const isLocked = daysDiff(today, dateStr) > 3;
                            
                            return (
                              <td key={dateStr} className="px-2 py-2 text-center relative">
                                <button
                                  type="button"
                                  onClick={() => handleToggle(student.student_id, dateStr, status)}
                                  className={`
                                    flex h-6 w-6 items-center justify-center rounded border transition-colors mx-auto relative
                                    ${isPresent && !isLocked ? 'border-primary bg-primary text-primary-foreground' : ''}
                                    ${isPresent && isLocked ? 'border-primary/50 bg-primary/50 text-primary-foreground' : ''}
                                    ${!isPresent && !isLocked ? 'border-input bg-transparent hover:bg-muted' : ''}
                                    ${!isPresent && isLocked ? 'border-input/50 bg-muted/50 cursor-pointer' : ''}
                                  `}
                                >
                                  {isPresent && <Check className="h-4 w-4" />}
                                  {isLocked && !isPresent && <Lock className="h-3 w-3 text-muted-foreground absolute" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Select a class above to mark attendance.</p>
>>>>>>> Stashed changes
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
