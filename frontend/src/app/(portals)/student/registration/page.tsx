'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookMarked, CheckSquare, GraduationCap } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';
import { buildDemoRegistration } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

type EnrollmentRow = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  semester: number;
  course_type?: string;
};

type RegistrationData = {
  current_semester: number;
  credits_earned: number;
  credits_required: number;
  electives_needed: number;
  electives_max: number;
  core_enrollments: EnrollmentRow[];
  elective_enrollments: EnrollmentRow[];
  available_electives: { course_id: string; course_code: string; course_name: string; credits: number }[];
};

function isRegistrationEmpty(data: RegistrationData | null | undefined): boolean {
  if (!data) return true;
  return (
    (data.core_enrollments?.length ?? 0) === 0 &&
    (data.elective_enrollments?.length ?? 0) === 0 &&
    (data.available_electives?.length ?? 0) === 0
  );
}

function EnrollmentCard({ enrollment, registered }: { enrollment: EnrollmentRow; registered?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="font-medium text-sgvu-navy">
        {enrollment.course_code} — {enrollment.course_name} ({enrollment.credits} cr) · Sem {enrollment.semester}
        {registered ? ' · registered' : ' · CORE'}
      </p>
      <Link
        href={`/student/courses/${enrollment.course_id}`}
        className="shrink-0 text-xs font-semibold text-sgvu-navy underline hover:text-sgvu-gold"
      >
        Open workspace
      </Link>
    </div>
  );
}

export default function StudentRegistrationPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<RegistrationData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedElectives, setSelectedElectives] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const live = await api.get<RegistrationData>('/api/student/registration');
        if (cancelled) return;
        if (isRegistrationEmpty(live) && isStudentDemoModeEnabled()) {
          setData(buildDemoRegistration());
          setUsingDemo(true);
        } else {
          setData(live);
          setUsingDemo(false);
        }
      } catch {
        if (cancelled) return;
        if (isStudentDemoModeEnabled()) {
          setData(buildDemoRegistration());
          setUsingDemo(true);
        } else {
          setData(null);
          setUsingDemo(false);
          toast.error('Could not load registration. Confirm the backend is running, then retry.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function register() {
    if (selectedElectives.length === 0 || selectedElectives.length > 2) return;
    setRegistering(true);
    try {
      if (usingDemo) {
        const picked = (data?.available_electives ?? []).filter((c) =>
          selectedElectives.includes(c.course_id),
        );
        setData((prev) => {
          if (!prev) return prev;
          const nextElectives = [
            ...prev.elective_enrollments,
            ...picked.map((c) => ({
              course_id: c.course_id,
              course_code: c.course_code,
              course_name: c.course_name,
              credits: c.credits,
              semester: prev.current_semester,
              course_type: 'ELECTIVE',
            })),
          ];
          return {
            ...prev,
            elective_enrollments: nextElectives,
            available_electives: prev.available_electives.filter(
              (c) => !selectedElectives.includes(c.course_id),
            ),
            electives_needed: Math.max(0, prev.electives_max - nextElectives.length),
          };
        });
        setSelectedElectives([]);
        toast.success('Electives registered for this semester (demo)');
        return;
      }

      await api.post('/api/academics/courses/register', { course_ids: selectedElectives });
      toast.success('Electives registered for this semester');
      setSelectedElectives([]);
      const live = await api.get<RegistrationData>('/api/student/registration');
      setData(live);
      setUsingDemo(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  function toggleElective(id: string) {
    setSelectedElectives((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= (data?.electives_max ?? 2)) {
        toast.error('Pick at most 2 electives');
        return prev;
      }
      return [...prev, id];
    });
  }

  if (loading) return <StudentLoadingState label="Loading CBCS registration…" />;

  const progress = data ? Math.min(100, (data.credits_earned / data.credits_required) * 100) : 0;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Courses"
        description="Choice Based Credit System — register electives and track graduation credits."
      />

      {!data ? (
        <StudentEmptyState
          title="Registration unavailable"
          description="Could not load your CBCS registration. Confirm the backend is running, then refresh."
        />
      ) : (
        <>
          <StudentSectionCard
            title={`Credit tracker — Semester ${data.current_semester}`}
            description="Progress toward graduation credit requirement"
            icon={GraduationCap}
            tone="gold"
          >
            <StudentStatCard
              label="Credits earned"
              value={`${data.credits_earned} / ${data.credits_required}`}
              helper={`${progress.toFixed(0)}% of graduation requirement`}
              className="mb-4 border-0 bg-transparent p-0 shadow-none hover:translate-y-0 hover:shadow-none"
            />
            <Progress value={progress} className="h-3" />
          </StudentSectionCard>

          <StudentSectionCard title="Core subjects (auto-enrolled)" description="Registered automatically at semester start" icon={BookMarked}>
            {data.core_enrollments.length === 0 ? (
              <StudentEmptyState title="No core enrollments" description="Core subjects appear when the semester begins." />
            ) : (
              <div className="space-y-2">
                {data.core_enrollments.map((e) => (
                  <EnrollmentCard key={e.course_id} enrollment={e} />
                ))}
              </div>
            )}
          </StudentSectionCard>

          <StudentSectionCard
            title={`Pick your electives (${data.electives_needed} remaining)`}
            description="Select up to 2 electives from the dropdown"
            icon={CheckSquare}
          >
            {data.available_electives.length === 0 && data.elective_enrollments.length >= 2 ? (
              <StudentEmptyState title="Electives complete" description="You have registered 2 electives this semester." />
            ) : data.available_electives.length === 0 ? (
              <StudentEmptyState title="No electives available" description="Elective options will appear when registration opens." />
            ) : (
              <div className="space-y-3">
                <Select
                  className="w-full rounded-xl border px-4 py-3 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) toggleElective(e.target.value);
                  }}
                >
                  <option value="">Choose an elective…</option>
                  {data.available_electives
                    .filter((c) => !selectedElectives.includes(c.course_id))
                    .map((c) => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.course_code} — {c.course_name} ({c.credits} cr)
                      </option>
                    ))}
                </Select>
                {selectedElectives.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedElectives.map((id) => {
                      const c = data.available_electives.find((x) => x.course_id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleElective(id)}
                          className="rounded-full bg-sgvu-navy px-3 py-1 text-xs font-semibold text-white"
                        >
                          {c?.course_code ?? id} ×
                        </button>
                      );
                    })}
                  </div>
                )}
                {data.elective_enrollments.map((e) => (
                  <EnrollmentCard key={e.course_id} enrollment={e} registered />
                ))}
                <Button
                  disabled={registering || selectedElectives.length === 0 || selectedElectives.length > 2}
                  onClick={() => void register()}
                >
                  {registering ? 'Registering…' : `Register ${selectedElectives.length} elective(s)`}
                </Button>
              </div>
            )}
          </StudentSectionCard>
        </>
      )}
    </StudentPageShell>
  );
}
