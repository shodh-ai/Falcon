'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { academicsApi, type ClassStudent } from '@/lib/api/api.academics';

type UiStatus = 'present' | 'absent';

function toApiStatus(s: UiStatus): 'PRESENT' | 'ABSENT' {
  return s === 'present' ? 'PRESENT' : 'ABSENT';
}

function FacultyAttendanceContent() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const classId = Number(searchParams.get('classId'));
  const subjectId = Number(searchParams.get('subjectId'));
  const batchId = Number(searchParams.get('batchId'));
  const subjectName = searchParams.get('subject') ?? 'Class';
  const timeLabel = searchParams.get('time') ?? '';
  const roomLabel = searchParams.get('room') ?? '';

  const [roster, setRoster] = useState<ClassStudent[]>([]);
  const [status, setStatus] = useState<Record<string, UiStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const validClass = Number.isFinite(classId) && classId > 0;

  useEffect(() => {
    if (!token || !validClass) {
      setLoading(false);
      if (!validClass) setLoadError('Select a class from your dashboard first.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const students = await academicsApi.getClassStudents(token, classId);
        if (cancelled) return;
        setRoster(students);
        setStatus(Object.fromEntries(students.map((s) => [s.student_id, 'present' as UiStatus])));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load students');
          setRoster([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, classId, validClass]);

  const markAllPresent = () => {
    setStatus(Object.fromEntries(roster.map((s) => [s.student_id, 'present'])));
    toast.success('All marked present');
  };

  const toggle = (id: string) => {
    setStatus((prev) => ({
      ...prev,
      [id]: prev[id] === 'present' ? 'absent' : 'present',
    }));
  };

  const sessionDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const submit = async () => {
    if (!token || !validClass || !Number.isFinite(subjectId)) return;

    const snapshot = { ...status };
    setSaving(true);

    try {
      await academicsApi.bulkAttendance(token, {
        course_offering_id: classId,
        subject_id: subjectId,
        batch_id: Number.isFinite(batchId) && batchId > 0 ? batchId : undefined,
        session_date: sessionDate,
        session_slot: String(classId),
        entries: roster.map((s) => ({
          student_id: s.student_id,
          status: toApiStatus(snapshot[s.student_id] ?? 'present'),
        })),
      });
      toast.success('Attendance saved!');
    } catch {
      setStatus(snapshot);
      toast.error('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!validClass) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="text-muted-foreground">{loadError ?? 'No class selected.'}</p>
        <Button onClick={() => router.push('/faculty/dashboard')}>Back to dashboard</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        Loading roster…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError}</p>
        <Button variant="outline" onClick={() => router.push('/faculty/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-sgvu-navy">{subjectName}</h2>
          <p className="text-sm text-muted-foreground">
            {[timeLabel, roomLabel].filter(Boolean).join(' · ') || 'Today'}
          </p>
        </div>
        <Button variant="secondary" onClick={markAllPresent} className="touch-target" disabled={saving}>
          Mark All Present
        </Button>
      </div>

      <div className="space-y-3 md:hidden">
        {roster.map((s) => (
          <Card
            key={s.student_id}
            className={cn(
              'cursor-pointer transition',
              status[s.student_id] === 'absent' && 'border-destructive/50 bg-red-50',
            )}
            onClick={() => !saving && toggle(s.student_id)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <Avatar>
                {s.photo_url ? <AvatarImage src={s.photo_url} alt={s.name} /> : null}
                <AvatarFallback>{s.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.roll_number}</p>
              </div>
              <span
                className={cn(
                  'text-sm font-bold',
                  status[s.student_id] === 'present' ? 'text-emerald-600' : 'text-destructive',
                )}
              >
                {status[s.student_id] === 'present' ? 'Present' : 'Absent'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Class roster ({roster.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {roster.map((s) => (
            <button
              key={s.student_id}
              type="button"
              disabled={saving}
              onClick={() => toggle(s.student_id)}
              className={cn(
                'rounded-xl border p-4 text-left transition touch-target',
                status[s.student_id] === 'present'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-destructive/40 bg-red-50',
              )}
            >
              <Avatar className="mb-2 h-10 w-10">
                {s.photo_url ? <AvatarImage src={s.photo_url} alt={s.name} /> : null}
                <AvatarFallback>{s.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.roll_number}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {roster.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No enrolled students found for this class.</p>
      )}

      <Button className="w-full" size="lg" onClick={submit} disabled={saving || roster.length === 0}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          'Save attendance'
        )}
      </Button>
    </div>
  );
}

export default function FacultyAttendancePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading…
        </div>
      }
    >
      <FacultyAttendanceContent />
    </Suspense>
  );
}
