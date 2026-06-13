'use client';

import { useEffect, useState } from 'react';
import { Award, GraduationCap, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type AlumniEligibility = {
  eligible: boolean;
  current_semester: number;
  max_semester: number;
  no_dues: { finance: boolean; library: boolean; hostel: boolean; all_cleared: boolean };
  final_semester_results_published: boolean;
  active_backlogs: number;
  blockers: string[];
  alumni_converted: boolean;
  request_pending: boolean;
};

type ExitData = {
  no_dues: { key: string; label: string; cleared: boolean }[];
  progress_percent: number;
  degree_issued_date: string | null;
  degree_award_status: string;
  final_result: string | null;
  alumni_converted: boolean;
  linkedin_url: string | null;
  placement_organization: string | null;
  clearance_tasks: { task_name: string; owner_department: string; status: string }[];
  alumni_eligibility: AlumniEligibility;
};

const alumniSchema = z.object({
  linkedin_url: z
    .string()
    .min(1, 'LinkedIn profile URL is required')
    .url('Enter a valid URL')
    .refine((v) => v.includes('linkedin.com'), { message: 'Must be a LinkedIn URL' }),
  organization: z.string().min(1, 'Current company / role is required'),
  higher_ed: z.string().optional(),
});

type AlumniFormValues = z.infer<typeof alumniSchema>;

export default function StudentExitPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExitData | null>(null);

  const form = useForm<AlumniFormValues>({
    resolver: zodResolver(alumniSchema),
    defaultValues: { linkedin_url: '', organization: '', higher_ed: '' },
    mode: 'onTouched',
  });

  const load = () => void api.get<ExitData>('/api/student/exit').then(setData);

  useEffect(() => {
    load();
  }, [api]);

  async function registerAlumni(values: AlumniFormValues) {
    try {
      await api.post('/api/alumni/register', {
        linkedin_url: values.linkedin_url,
        placement_organization: values.organization,
        higher_ed: values.higher_ed || undefined,
      });
      toast.success('Alumni conversion request submitted — routed to IQAC / Alumni Admin');
      form.reset();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  const progress = data?.progress_percent ?? 0;
  const eligibility = data?.alumni_eligibility;
  const canApply = Boolean(eligibility?.eligible);
  const { errors, isValid, isSubmitting } = form.formState;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Exit & Alumni Transition"
        description="Final-semester students only — automatic no-dues and academic checks must pass before applying."
      />

      <StudentStatCard
        label="No-dues clearance"
        value={`${progress}%`}
        helper={`${(data?.no_dues ?? []).filter((s) => s.cleared).length} of ${data?.no_dues?.length ?? 0} departments cleared`}
        icon={ShieldCheck}
        tone={progress === 100 ? 'success' : 'warning'}
      />

      <StudentSectionCard title="Department clearance tracker" description="Finance, Library, and Hostel must be green to apply" icon={ShieldCheck}>
        <Progress value={progress} className="mb-4 h-3" />
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.no_dues ?? []).map((step) => (
            <div key={step.key} className="flex items-center justify-between rounded-2xl border border-border/70 bg-white p-4 text-sm">
              <span className="font-medium text-sgvu-navy">{step.label}</span>
              <Badge variant={step.cleared ? 'success' : 'warning'}>{step.cleared ? 'Cleared' : 'Pending'}</Badge>
            </div>
          ))}
        </div>
      </StudentSectionCard>

      <StudentSectionCard title="Final result & degree" description="Semester 8 results must be published with zero active backlogs" icon={Award}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StudentStatCard label="Final result" value={data?.final_result ?? 'In progress'} helper="Academic outcome" />
          <StudentStatCard
            label="Semester 8 results"
            value={eligibility?.final_semester_results_published ? 'Published' : 'Pending'}
            helper="Required for alumni conversion"
            tone={eligibility?.final_semester_results_published ? 'success' : 'warning'}
          />
          <StudentStatCard
            label="Active backlogs"
            value={eligibility?.active_backlogs ?? '—'}
            helper="Must be zero"
            tone={(eligibility?.active_backlogs ?? 1) === 0 ? 'success' : 'warning'}
          />
        </div>
      </StudentSectionCard>

      <StudentSectionCard
        title="Apply for Alumni Status"
        description={
          canApply
            ? 'Submit your corporate profile for IQAC / Alumni Admin verification'
            : 'Complete all prerequisites below before the form unlocks'
        }
        icon={GraduationCap}
        tone={data?.alumni_converted ? 'success' : canApply ? 'gold' : 'warning'}
      >
        {data?.alumni_converted ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm font-medium text-emerald-800">
            You are registered for the Alumni Portal. Sign in with your @mygyanvihar.com account to access /alumni.
          </p>
        ) : eligibility?.request_pending ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm font-medium text-amber-900">
            Your alumni conversion request is pending review by the Alumni Admin / IQAC team.
          </p>
        ) : (
          <>
            {!canApply && eligibility?.blockers?.length ? (
              <ul className="mb-4 space-y-1 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-900">
                {eligibility.blockers.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            ) : null}

            <form className="space-y-3" onSubmit={form.handleSubmit(registerAlumni)}>
              <div>
                <Input placeholder="LinkedIn profile URL" disabled={!canApply} {...form.register('linkedin_url')} />
                {errors.linkedin_url && <p className="mt-1 text-xs text-destructive">{errors.linkedin_url.message}</p>}
              </div>
              <div>
                <Input placeholder="Current company / job role" disabled={!canApply} {...form.register('organization')} />
                {errors.organization && <p className="mt-1 text-xs text-destructive">{errors.organization.message}</p>}
              </div>
              <div>
                <Input
                  placeholder="Higher education plans (optional, e.g. M.Tech at IIT Delhi)"
                  disabled={!canApply}
                  {...form.register('higher_ed')}
                />
              </div>
              <Button type="submit" disabled={!canApply || !isValid || isSubmitting}>
                <UserPlus className="h-4 w-4" />
                Apply for Alumni Status
              </Button>
              {!canApply ? (
                <p className="text-xs text-muted-foreground">
                  Semester {eligibility?.current_semester ?? '—'} of 8 — button unlocks when all guardrails pass.
                </p>
              ) : null}
            </form>
          </>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
