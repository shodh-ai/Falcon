'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type UiStatus = 'PRESENT' | 'ABSENT';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function MarkAttendanceContent() {
  const api = useAuthedApi();
  const params = useSearchParams();
  const initialCourseId = params.get('courseId');
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, UiStatus>>({});
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedClass = useMemo(
    () => classes.find((c) => c.course_id === selectedCourseId) ?? null,
    [classes, selectedCourseId],
  );

  useEffect(() => {
    void api.get<FacultyClass[]>('/api/academics/faculty/timetable/today').then(setClasses).finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let cancelled = false;
    (async () => {
      try {
        const [roster, state] = await Promise.all([
          api.get<Student[]>(`/api/academics/faculty/course/${selectedCourseId}/students`),
          api.get<{ locked: boolean; attendance_data: { student_id: string; status: UiStatus }[] | null }>(
            `/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}`,
          ),
        ]);
        if (cancelled) return;
        setStudents(roster);
        setLocked(state.locked);
        const map: Record<string, UiStatus> = {};
        for (const s of roster) map[s.student_id] = 'PRESENT';
        for (const row of state.attendance_data ?? []) {
          if (row.status === 'PRESENT' || row.status === 'ABSENT') map[row.student_id] = row.status;
        }
        setAttendance(map);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load roster');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, selectedCourseId, selectedDate]);

  async function save() {
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      const result = await api.post<{ saved: number; attendance_updated?: { attendance_percent: string }[] }>(
        '/api/academics/faculty/attendance',
        {
          course_id: selectedCourseId,
          date: selectedDate,
          attendance_data: Object.entries(attendance).map(([student_id, status]) => ({ student_id, status })),
        },
      );
      const state = await api.get<{ locked: boolean }>(
        `/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}`,
      );
      setLocked(state.locked);
      const updatedCount = result.attendance_updated?.length ?? result.saved;
      toast.success(`Attendance saved · ${updatedCount} student${updatedCount === 1 ? '' : 's'} synced`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Mark Attendance"
        description="Dedicated attendance workspace — select today's class, mark present/absent, then log the lecture in Class Logbook."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/faculty/logbook">Open logbook</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => (
          <Card
            key={c.timetable_id}
            className={`cursor-pointer transition ${selectedCourseId === c.course_id ? 'ring-2 ring-sgvu-gold' : ''}`}
            onClick={() => setSelectedCourseId(c.course_id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {c.course_code} — {c.course_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {String(c.start_time).slice(0, 5)}–{String(c.end_time).slice(0, 5)} · Room {c.room ?? 'TBA'} · {c.student_count} students
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedClass ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{selectedClass.course_name}</CardTitle>
            {locked ? <Badge>Locked</Badge> : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="date"
              className="rounded-md border px-3 py-2 text-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <Input
              type="search"
              placeholder="Search by name or roll number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {students
              .filter(
                (s) =>
                  !searchQuery.trim() ||
                  s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  s.roll_number?.includes(searchQuery),
              )
              .map((s) => (
              <div key={s.student_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>
                  {s.name} <span className="text-muted-foreground">({s.roll_number})</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={attendance[s.student_id] === 'PRESENT' ? 'default' : 'outline'}
                    disabled={locked}
                    onClick={() => setAttendance((a) => ({ ...a, [s.student_id]: 'PRESENT' }))}
                  >
                    Present
                  </Button>
                  <Button
                    size="sm"
                    variant={attendance[s.student_id] === 'ABSENT' ? 'destructive' : 'outline'}
                    disabled={locked}
                    onClick={() => setAttendance((a) => ({ ...a, [s.student_id]: 'ABSENT' }))}
                  >
                    Absent
                  </Button>
                </div>
              </div>
            ))}
            {students.length > 0 &&
              students.filter(
                (s) =>
                  !searchQuery.trim() ||
                  s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  s.roll_number?.includes(searchQuery),
              ).length === 0 && (
                <p className="text-sm text-muted-foreground">No students match &ldquo;{searchQuery}&rdquo;.</p>
              )}
            <Button disabled={locked || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save attendance'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Select a class above to mark attendance.</p>
      )}
    </div>
  );
}

export default function FacultyAttendancePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading attendance…</div>}>
      <MarkAttendanceContent />
    </Suspense>
  );
}
