'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, CalendarDays, ListChecks, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { academicsApi, type FacultyTodayClass } from '@/lib/api/api.academics';

export default function FacultyDashboardPage() {
  const { token } = useAuth();
  const [classes, setClasses] = useState<FacultyTodayClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await academicsApi.getFacultyTodayClasses(token);
        if (!cancelled) setClasses(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load classes');
          setClasses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const attendanceHref = (c: FacultyTodayClass) => {
    const params = new URLSearchParams({
      classId: String(c.classId),
      subjectId: String(c.subjectId),
      batchId: String(c.batchId),
      subject: c.subjectName,
      time: c.time,
      room: c.roomNumber,
    });
    return `/faculty/attendance?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Faculty Dashboard</h2>
        <p className="text-sm text-muted-foreground">Mark attendance in under 30 seconds.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-sgvu-gold" />
              Today&apos;s Classes
            </CardTitle>
            <CardDescription>Tap to open attendance grid</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading schedule…
              </div>
            )}
            {!loading && error && (
              <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
            )}
            {!loading && !error && classes.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No classes scheduled for today. Timetable entries appear here once the registrar assigns your slots.
              </p>
            )}
            {!loading &&
              !error &&
              classes.map((c) => (
                <Link
                  key={c.timetableEntryId}
                  href={attendanceHref(c)}
                  className="flex w-full flex-col items-start justify-between gap-2 rounded-xl border border-input bg-background p-4 transition hover:bg-accent touch-target sm:flex-row sm:items-center"
                >
                  <span>
                    <span className="font-semibold text-sgvu-navy">{c.subjectName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.time} · {c.roomNumber} · {c.studentCount} students
                    </span>
                  </span>
                  <Badge variant="secondary">Mark Attendance</Badge>
                </Link>
              ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-sgvu-gold" />
                IQAC Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black text-sgvu-navy">2 pending</p>
              <p className="text-sm text-muted-foreground">May compliance uploads due in 4 days</p>
              <Button asChild className="mt-4 w-full" variant="secondary">
                <Link href="/faculty/iqac">Open tasks</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-sgvu-gold" />
                Leave Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-muted p-3">
                <p className="font-bold text-sgvu-navy">4</p>
                <p className="text-xs text-muted-foreground">CL</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="font-bold text-sgvu-navy">6</p>
                <p className="text-xs text-muted-foreground">SL</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="font-bold text-sgvu-navy">12</p>
                <p className="text-xs text-muted-foreground">EL</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
