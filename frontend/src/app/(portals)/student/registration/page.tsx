'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';

type RegistrationData = {
  current_semester: number;
  credits_earned: number;
  credits_required: number;
  enrollments: {
    course_id: string;
    course_code: string;
    course_name: string;
    credits: number;
    semester: number;
    status: string;
  }[];
  available_electives: { course_id: string; course_code: string; course_name: string; credits: number }[];
};

export default function StudentRegistrationPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<RegistrationData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);

  const load = () => void api.get<RegistrationData>('/api/student/registration').then(setData);

  useEffect(() => {
    load();
  }, [api]);

  async function register() {
    if (!selected.length) return;
    setRegistering(true);
    try {
      await api.post('/api/academics/courses/register', { course_ids: selected });
      toast.success('Subjects registered for upcoming semester');
      setSelected([]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  const progress = data ? Math.min(100, (data.credits_earned / data.credits_required) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Subjects & Registration (CBCS)"
        description="Choice Based Credit System — register electives and track graduation credits."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit tracker — Semester {data?.current_semester ?? '—'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            {data?.credits_earned ?? 0} / {data?.credits_required ?? 160} credits earned
          </p>
          <Progress value={progress} className="h-3" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current enrollments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.enrollments ?? []).map((e) => (
            <div key={`${e.course_code}-${e.semester}`} className="flex items-center justify-between gap-2">
              <p>
                {e.course_code} — {e.course_name} ({e.credits} cr) · Sem {e.semester} · {e.status}
              </p>
              <Link
                href={`/student/courses/${e.course_id}`}
                className="shrink-0 text-sm font-semibold text-sgvu-navy underline"
              >
                Open course
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available electives</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.available_electives ?? []).map((c) => (
            <label key={c.course_id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={selected.includes(c.course_id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, c.course_id] : prev.filter((id) => id !== c.course_id),
                  )
                }
              />
              {c.course_code} — {c.course_name} ({c.credits} credits)
            </label>
          ))}
          <Button disabled={registering || !selected.length} onClick={() => void register()}>
            {registering ? 'Registering…' : 'Register selected subjects'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
