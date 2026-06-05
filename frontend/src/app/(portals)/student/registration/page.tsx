'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookMarked, CheckSquare, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
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
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Subjects & Registration (CBCS)"
        description="Choice Based Credit System — register electives and track graduation credits."
      />

      <StudentSectionCard
        title={`Credit tracker — Semester ${data?.current_semester ?? '—'}`}
        description="Progress toward graduation credit requirement"
        icon={GraduationCap}
        tone="gold"
      >
        <StudentStatCard
          label="Credits earned"
          value={`${data?.credits_earned ?? 0} / ${data?.credits_required ?? 160}`}
          helper={`${progress.toFixed(0)}% of graduation requirement`}
          className="mb-4 border-0 bg-transparent p-0 shadow-none hover:translate-y-0 hover:shadow-none"
        />
        <Progress value={progress} className="h-3" />
      </StudentSectionCard>

      <StudentSectionCard title="Current enrollments" description="Subjects registered across semesters" icon={BookMarked}>
        {(data?.enrollments ?? []).length === 0 ? (
          <StudentEmptyState title="No enrollments" description="Registered subjects will appear here." />
        ) : (
          <div className="space-y-3">
            {(data?.enrollments ?? []).map((e) => (
              <div
                key={`${e.course_code}-${e.semester}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-white p-4 text-sm"
              >
                <p className="font-medium text-sgvu-navy">
                  {e.course_code} — {e.course_name} ({e.credits} cr) · Sem {e.semester} · {e.status}
                </p>
                <Link href={`/student/courses/${e.course_id}`} className="shrink-0 text-sm font-semibold text-sgvu-navy underline">
                  Open course
                </Link>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard title="Available electives" description="Select subjects to register for the upcoming semester" icon={CheckSquare}>
        {(data?.available_electives ?? []).length === 0 ? (
          <StudentEmptyState title="No electives available" description="Elective options will appear when registration opens." />
        ) : (
          <div className="space-y-3">
            {(data?.available_electives ?? []).map((c) => (
              <label
                key={c.course_id}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border accent-sgvu-navy"
                  checked={selected.includes(c.course_id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, c.course_id] : prev.filter((id) => id !== c.course_id)))
                  }
                />
                <span className="font-medium text-sgvu-navy">
                  {c.course_code} — {c.course_name} ({c.credits} credits)
                </span>
              </label>
            ))}
            <Button disabled={registering || !selected.length} onClick={() => void register()} className="mt-2">
              {registering ? 'Registering…' : `Register ${selected.length || ''} selected subject${selected.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
