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
};

const alumniSchema = z.object({
  linkedin_url: z
    .string()
    .min(1, 'LinkedIn profile URL is required')
    .url('Enter a valid URL')
    .refine((v) => v.includes('linkedin.com'), { message: 'Must be a LinkedIn URL' }),
  organization: z.string().optional(),
});

type AlumniFormValues = z.infer<typeof alumniSchema>;

export default function StudentExitPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExitData | null>(null);

  const form = useForm<AlumniFormValues>({
    resolver: zodResolver(alumniSchema),
    defaultValues: { linkedin_url: '', organization: '' },
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
        placement_organization: values.organization || null,
      });
      toast.success('Alumni portal registration submitted');
      form.reset();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  const progress = data?.progress_percent ?? 0;
  const { errors, isValid, isSubmitting } = form.formState;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Exit & Alumni Transition"
        description="No-dues clearance, degree issuance status, and alumni portal registration for final-semester students."
      />

      <StudentStatCard
        label="No-dues clearance"
        value={`${progress}%`}
        helper={`${(data?.no_dues ?? []).filter((s) => s.cleared).length} of ${data?.no_dues?.length ?? 0} departments cleared`}
        icon={ShieldCheck}
        tone={progress === 100 ? 'success' : 'warning'}
      />

      <StudentSectionCard title="Department clearance tracker" description="Each department must sign off before degree issuance" icon={ShieldCheck}>
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

      <StudentSectionCard title="Final result & degree" description="Award status and certificate availability" icon={Award}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StudentStatCard label="Final result" value={data?.final_result ?? 'In progress'} helper="Academic outcome" />
          <StudentStatCard label="Degree status" value={data?.degree_award_status ?? '—'} helper="Award processing" />
          <StudentStatCard
            label="Degree issued"
            value={data?.degree_issued_date ? new Date(data.degree_issued_date).toLocaleDateString() : 'Not yet'}
            helper="Official issuance date"
          />
        </div>
        <Button variant="outline" size="sm" className="mt-4" disabled>
          Download provisional certificate (when issued)
        </Button>
      </StudentSectionCard>

      <StudentSectionCard
        title="Alumni conversion"
        description="Register for the alumni portal after graduation"
        icon={GraduationCap}
        tone={data?.alumni_converted ? 'success' : 'gold'}
      >
        {data?.alumni_converted ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm font-medium text-emerald-800">
            You are registered for the Alumni Portal.
          </p>
        ) : (
          <form className="space-y-3" onSubmit={form.handleSubmit(registerAlumni)}>
            <div>
              <Input placeholder="LinkedIn profile URL" {...form.register('linkedin_url')} />
              {errors.linkedin_url && <p className="mt-1 text-xs text-destructive">{errors.linkedin_url.message}</p>}
            </div>
            <div>
              <Input placeholder="Organization / Occupation (optional)" {...form.register('organization')} />
            </div>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              <UserPlus className="h-4 w-4" />
              Register for Alumni Portal
            </Button>
          </form>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
