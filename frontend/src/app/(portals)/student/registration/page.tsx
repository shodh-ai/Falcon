'use client';

import { useEffect, useState } from 'react';
import { BookMarked, CheckSquare, GraduationCap } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
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
  electives_needed: number;
  electives_max: number;
  core_enrollments: { course_code: string; course_name: string; credits: number; semester: number; course_type?: string }[];
  elective_enrollments: { course_code: string; course_name: string; credits: number; semester: number }[];
  available_electives: { course_id: string; course_code: string; course_name: string; credits: number }[];
};

export default function StudentRegistrationPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<RegistrationData | null>(null);
  const [selectedElectives, setSelectedElectives] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);

  const load = () => void api.get<RegistrationData>('/api/student/registration').then(setData);

  useEffect(() => {
    load();
  }, [api]);

  async function register() {
    if (selectedElectives.length === 0 || selectedElectives.length > 2) return;
    setRegistering(true);
    try {
      await api.post('/api/academics/courses/register', { course_ids: selectedElectives });
      toast.success('Electives registered for this semester');
      setSelectedElectives([]);
      load();
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

      <StudentSectionCard title="Core subjects (auto-enrolled)" description="Registered automatically at semester start" icon={BookMarked}>
        {(data?.core_enrollments ?? []).length === 0 ? (
          <StudentEmptyState title="No core enrollments" description="Core subjects appear when the semester begins." />
        ) : (
          <div className="space-y-2">
            {(data?.core_enrollments ?? []).map((e) => (
              <div key={e.course_code} className="rounded-2xl border bg-white p-4 text-sm font-medium text-sgvu-navy">
                {e.course_code} — {e.course_name} ({e.credits} cr) · Sem {e.semester} · CORE
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard
        title={`Pick your electives (${data?.electives_needed ?? 2} remaining)`}
        description="Select up to 2 electives from the dropdown"
        icon={CheckSquare}
      >
        {(data?.available_electives ?? []).length === 0 && (data?.elective_enrollments ?? []).length >= 2 ? (
          <StudentEmptyState title="Electives complete" description="You have registered 2 electives this semester." />
        ) : (data?.available_electives ?? []).length === 0 ? (
          <StudentEmptyState title="No electives available" description="Elective options will appear when registration opens." />
        ) : (
          <div className="space-y-3">
            <select
              className="w-full rounded-xl border px-4 py-3 text-sm"
              value=""
              onChange={(e) => {
                if (e.target.value) toggleElective(e.target.value);
              }}
            >
              <option value="">Choose an elective…</option>
              {(data?.available_electives ?? [])
                .filter((c) => !selectedElectives.includes(c.course_id))
                .map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_code} — {c.course_name} ({c.credits} cr)
                  </option>
                ))}
            </select>
            {selectedElectives.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedElectives.map((id) => {
                  const c = data?.available_electives.find((x) => x.course_id === id);
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
            {(data?.elective_enrollments ?? []).map((e) => (
              <div key={e.course_code} className="rounded-2xl border border-sgvu-gold/30 bg-sgvu-gold/5 p-4 text-sm">
                ✓ {e.course_code} — {e.course_name} (registered)
              </div>
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
    </StudentPageShell>
  );
}
