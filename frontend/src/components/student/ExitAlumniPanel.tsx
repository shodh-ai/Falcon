'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Loader2,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { DEMO_EXIT } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { cn } from '@/lib/utils';

type AlumniEligibility = {
  eligible: boolean;
  current_semester: number;
  max_semester: number;
  no_dues: {
    finance: boolean;
    library: boolean;
    hostel: boolean;
    hostel_applicable?: boolean;
    dept?: boolean;
    all_cleared: boolean;
  };
  final_semester_results_published: boolean;
  active_backlogs: number;
  blockers: string[];
  alumni_converted: boolean;
  request_pending: boolean;
};

type ExitData = {
  no_dues: {
    key: string;
    label: string;
    cleared: boolean;
    not_applicable?: boolean;
  }[];
  progress_percent: number;
  degree_issued_date: string | null;
  degree_award_status: string;
  final_result: string | null;
  alumni_converted: boolean;
  linkedin_url: string | null;
  placement_organization: string | null;
  conversion_requested_at?: string | null;
  alumni_request?: {
    verification_status: string;
    linkedin_url: string | null;
    organization: string | null;
    updated_at: string | null;
  } | null;
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

const whiteCard = 'border-sgvu-navy/10 bg-white shadow-sm';
const whiteStat = 'border-sgvu-navy/10 bg-white';
const navyBtn =
  'bg-[#0B2447] px-8 text-white shadow-md hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy disabled:bg-[#0B2447] disabled:text-white disabled:opacity-55';

function formatWhen(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ExitAlumniPanel() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingPending, setEditingPending] = useState(false);

  const form = useForm<AlumniFormValues>({
    resolver: zodResolver(alumniSchema),
    defaultValues: { linkedin_url: '', organization: '', higher_ed: '' },
    mode: 'onTouched',
  });

  const applyPayload = useCallback(
    (next: ExitData) => {
      setData(next);
      setLoadError(null);
      form.reset({
        linkedin_url: next.linkedin_url ?? next.alumni_request?.linkedin_url ?? '',
        organization:
          next.placement_organization ?? next.alumni_request?.organization ?? '',
        higher_ed: '',
      });
    },
    [form],
  );

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const next = await api.get<ExitData>('/api/student/exit');
      applyPayload(next);
      return true;
    } catch (e) {
      if (isStudentDemoModeEnabled()) {
        applyPayload(DEMO_EXIT as ExitData);
        return true;
      }
      const message = e instanceof Error ? e.message : 'Could not load exit status';
      setLoadError(message);
      return false;
    }
  }, [api, applyPayload]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function refreshStatus() {
    setRefreshing(true);
    try {
      const ok = await load();
      if (ok) toast.success('Status refreshed');
      else toast.error('Could not refresh status');
    } finally {
      setRefreshing(false);
    }
  }

  async function retryInitialLoad() {
    setLoading(true);
    setLoadError(null);
    const ok = await load();
    setLoading(false);
    if (!ok) toast.error('Could not load exit status');
  }

  async function registerAlumni(values: AlumniFormValues) {
    try {
      const res = await api.post<{ submitted?: boolean; updated?: boolean }>(
        '/api/alumni/register',
        {
          linkedin_url: values.linkedin_url.trim(),
          placement_organization: values.organization.trim(),
          organization: values.organization.trim(),
          higher_ed: values.higher_ed?.trim() || undefined,
        },
      );
      toast.success(
        res.updated
          ? 'Alumni request updated — still with Alumni Admin / IQAC'
          : 'Alumni conversion request submitted — routed to IQAC / Alumni Admin',
      );
      setEditingPending(false);
      await load();
    } catch (e) {
      if (isStudentDemoModeEnabled()) {
        const now = new Date().toISOString();
        applyPayload({
          ...(data ?? (DEMO_EXIT as ExitData)),
          linkedin_url: values.linkedin_url.trim(),
          placement_organization: values.organization.trim(),
          conversion_requested_at: now,
          alumni_request: {
            verification_status: 'PENDING',
            linkedin_url: values.linkedin_url.trim(),
            organization: values.organization.trim(),
            updated_at: now,
          },
          alumni_eligibility: {
            ...(data?.alumni_eligibility ?? DEMO_EXIT.alumni_eligibility),
            eligible: false,
            request_pending: true,
            blockers: ['Alumni conversion request already pending review'],
          },
        });
        setEditingPending(false);
        toast.success('Alumni conversion request submitted — routed to IQAC / Alumni Admin');
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  if (loading) return <StudentLoadingState label="Loading exit & alumni status…" />;

  if (!data) {
    return (
      <div className={cn('rounded-2xl border p-6 text-center', whiteCard)}>
        <p className="text-sm font-semibold text-sgvu-navy">Exit status unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError ?? 'Please try again.'}</p>
        <div className="mt-4 flex justify-center">
          <Button type="button" onClick={() => void retryInitialLoad()} className={navyBtn}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const progress = data.progress_percent ?? 0;
  const eligibility = data.alumni_eligibility;
  const canApply = Boolean(eligibility?.eligible);
  const clearedCount = (data.no_dues ?? []).filter((s) => s.cleared || s.not_applicable).length;
  const totalDepts = data.no_dues?.length ?? 0;
  const { errors, isValid, isSubmitting } = form.formState;
  const verificationStatus = (data.alumni_request?.verification_status ?? '').toUpperCase();
  const isConverted = Boolean(
    data.alumni_converted ||
      eligibility?.alumni_converted ||
      verificationStatus === 'VERIFIED' ||
      verificationStatus === 'APPROVED',
  );
  const isRejected = verificationStatus === 'REJECTED' && !isConverted;
  const isPending =
    (Boolean(eligibility?.request_pending) || verificationStatus === 'PENDING') &&
    !isConverted &&
    !isRejected;
  const submittedAt =
    formatWhen(data.conversion_requested_at) || formatWhen(data.alumni_request?.updated_at);
  const degreeIssued = formatDate(data.degree_issued_date);
  const degreeStatus = data.degree_award_status
    ? data.degree_award_status.replace(/_/g, ' ')
    : 'Pending';
  const tasks = data.clearance_tasks ?? [];

  const reviewSteps = isRejected
    ? [
        { label: 'Submitted', state: 'done' as const },
        { label: 'IQAC / Alumni review', state: 'rejected' as const },
        { label: 'Alumni access', state: 'upcoming' as const },
      ]
    : isConverted
      ? [
          { label: 'Submitted', state: 'done' as const },
          { label: 'IQAC / Alumni review', state: 'done' as const },
          { label: 'Alumni access', state: 'done' as const },
        ]
      : [
          { label: 'Submitted', state: 'done' as const },
          { label: 'IQAC / Alumni review', state: 'current' as const },
          { label: 'Alumni access', state: 'upcoming' as const },
        ];

  return (
    <div className="space-y-6">
      <StudentStatCard
        label="No-dues clearance"
        value={`${progress}%`}
        helper={`${clearedCount} of ${totalDepts} departments cleared`}
        icon={ShieldCheck}
        className={whiteStat}
      />

      <StudentSectionCard
        title="Department clearance tracker"
        description="Finance, Library, Department, and Hostel (if resident) must be cleared to apply"
        icon={ShieldCheck}
        className={whiteCard}
        tone="default"
      >
        <Progress value={progress} className="mb-4 h-3" />
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.no_dues ?? []).map((step) => (
            <div
              key={step.key}
              className="flex items-center justify-between rounded-2xl border border-sgvu-navy/10 bg-white p-4 text-sm"
            >
              <span className="font-medium text-sgvu-navy">{step.label}</span>
              <Badge
                variant={
                  step.not_applicable ? 'secondary' : step.cleared ? 'success' : 'warning'
                }
              >
                {step.not_applicable ? 'N/A' : step.cleared ? 'Cleared' : 'Pending'}
              </Badge>
            </div>
          ))}
        </div>

        {tasks.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Clearance tasks
            </p>
            {tasks.map((task) => (
              <div
                key={`${task.owner_department}-${task.task_name}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sgvu-navy/10 bg-white px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-sgvu-navy">{task.task_name}</p>
                  <p className="text-xs text-muted-foreground">{task.owner_department}</p>
                </div>
                <Badge variant={task.status === 'CLEARED' || task.status === 'DONE' ? 'success' : 'warning'}>
                  {task.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            ))}
          </div>
        ) : null}
      </StudentSectionCard>

      <StudentSectionCard
        title="Final result & degree"
        description="Semester 8 results must be published with zero active backlogs"
        icon={Award}
        className={whiteCard}
        tone="default"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StudentStatCard
            label="Final result"
            value={data.final_result ?? 'In progress'}
            helper="Academic outcome"
            className={whiteStat}
          />
          <StudentStatCard
            label="Semester 8 results"
            value={eligibility?.final_semester_results_published ? 'Published' : 'Pending'}
            helper="Required for alumni conversion"
            className={whiteStat}
          />
          <StudentStatCard
            label="Active backlogs"
            value={eligibility?.active_backlogs ?? '—'}
            helper="Must be zero"
            className={whiteStat}
          />
          <StudentStatCard
            label="Degree status"
            value={degreeStatus}
            helper={degreeIssued ? `Issued ${degreeIssued}` : 'Award / issue status'}
            className={whiteStat}
          />
        </div>
      </StudentSectionCard>

      <StudentSectionCard
        title="Apply for Alumni Status"
        description={
          isConverted
            ? 'You already have alumni access'
            : isRejected
              ? 'Your previous request was rejected — update details and resubmit'
              : isPending
                ? 'Your request is with Alumni Admin / IQAC for verification'
                : canApply
                  ? 'Submit your corporate profile for IQAC / Alumni Admin verification'
                  : 'Complete all prerequisites below before the form unlocks'
        }
        icon={GraduationCap}
        className={whiteCard}
        tone="default"
        action={
          <Button
            type="button"
            size="sm"
            onClick={() => void refreshStatus()}
            disabled={refreshing}
            className="bg-[#0B2447] px-4 text-white shadow-sm hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy disabled:bg-[#0B2447] disabled:text-white disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      >
        {isConverted ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-sgvu-navy/10 bg-white p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-sgvu-navy">Alumni access approved</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in with your @mygyanvihar.com account and open the Alumni workspace.
                </p>
              </div>
            </div>
          </div>
        ) : isPending || isRejected ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {reviewSteps.map((step) => {
                const Icon =
                  step.state === 'rejected'
                    ? XCircle
                    : step.state === 'done'
                      ? CheckCircle2
                      : step.state === 'current'
                        ? Clock3
                        : GraduationCap;
                return (
                  <div
                    key={step.label}
                    className="rounded-2xl border border-sgvu-navy/10 bg-white p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          step.state === 'done' && 'text-emerald-600',
                          step.state === 'rejected' && 'text-red-600',
                          step.state === 'current' && 'text-amber-600',
                          step.state === 'upcoming' && 'text-sgvu-navy/50',
                        )}
                      />
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {step.label}
                      </p>
                    </div>
                    <Badge
                      className="mt-2"
                      variant={
                        step.state === 'done'
                          ? 'success'
                          : step.state === 'rejected'
                            ? 'destructive'
                            : 'warning'
                      }
                    >
                      {step.state === 'done'
                        ? 'Done'
                        : step.state === 'rejected'
                          ? 'Rejected'
                          : step.state === 'current'
                            ? 'In progress'
                            : 'Waiting'}
                    </Badge>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-sgvu-navy">
                  {isRejected ? 'Request rejected' : 'Request under review'}
                </p>
                <Badge variant={isRejected ? 'destructive' : 'warning'}>
                  {isRejected ? 'Rejected' : 'Pending review'}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {isRejected
                  ? 'Update your LinkedIn or organization details and resubmit for another review.'
                  : 'Alumni Admin / IQAC will verify your profile. You will get alumni portal access after approval.'}
              </p>
              {isRejected &&
              eligibility?.blockers?.filter(
                (b) => !b.toLowerCase().includes('already pending'),
              ).length ? (
                <ul className="mt-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {eligibility.blockers
                    .filter((b) => !b.toLowerCase().includes('already pending'))
                    .map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                </ul>
              ) : null}
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-sgvu-navy/10 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    LinkedIn
                  </p>
                  <p className="mt-0.5 truncate font-medium text-sgvu-navy">
                    {data.linkedin_url || data.alumni_request?.linkedin_url || '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Organization
                  </p>
                  <p className="mt-0.5 truncate font-medium text-sgvu-navy">
                    {data.placement_organization || data.alumni_request?.organization || '—'}
                  </p>
                </div>
              </div>
              {submittedAt ? (
                <p className="mt-3 text-xs text-muted-foreground">Last updated {submittedAt}</p>
              ) : null}
            </div>

            {!editingPending && !isRejected ? (
              <div className="flex flex-col items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setEditingPending(true)}
                  className={navyBtn}
                >
                  <UserPlus className="h-4 w-4" />
                  Update submitted details
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  You can correct LinkedIn or company details while review is pending.
                </p>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={form.handleSubmit(registerAlumni)}>
                <Input
                  placeholder="LinkedIn profile URL"
                  className="bg-white"
                  {...form.register('linkedin_url')}
                />
                {errors.linkedin_url ? (
                  <p className="text-xs text-destructive">{errors.linkedin_url.message}</p>
                ) : null}
                <Input
                  placeholder="Current company / job role"
                  className="bg-white"
                  {...form.register('organization')}
                />
                {errors.organization ? (
                  <p className="text-xs text-destructive">{errors.organization.message}</p>
                ) : null}
                <Input
                  placeholder="Higher education plans (optional)"
                  className="bg-white"
                  {...form.register('higher_ed')}
                />
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                  {!isRejected ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingPending(false)}
                      className="border-sgvu-navy/20 bg-white"
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={
                      !isValid ||
                      isSubmitting ||
                      (isRejected &&
                        Boolean(
                          eligibility?.blockers?.some(
                            (b) => !b.toLowerCase().includes('already pending'),
                          ),
                        ))
                    }
                    className={navyBtn}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {isRejected ? 'Resubmit for review' : 'Save & keep in review'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <>
            {!canApply && eligibility?.blockers?.length ? (
              <ul className="mb-4 space-y-1 rounded-2xl border border-sgvu-navy/10 bg-white p-4 text-sm text-sgvu-navy">
                {eligibility.blockers.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            ) : null}

            <form className="space-y-3" onSubmit={form.handleSubmit(registerAlumni)}>
              <Input
                placeholder="LinkedIn profile URL"
                disabled={!canApply}
                className="bg-white"
                {...form.register('linkedin_url')}
              />
              {errors.linkedin_url ? (
                <p className="mt-1 text-xs text-destructive">{errors.linkedin_url.message}</p>
              ) : null}
              <Input
                placeholder="Current company / job role"
                disabled={!canApply}
                className="bg-white"
                {...form.register('organization')}
              />
              {errors.organization ? (
                <p className="mt-1 text-xs text-destructive">{errors.organization.message}</p>
              ) : null}
              <Input
                placeholder="Higher education plans (optional, e.g. M.Tech at IIT Delhi)"
                disabled={!canApply}
                className="bg-white"
                {...form.register('higher_ed')}
              />
              <div className="flex flex-col items-center gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={!canApply || !isValid || isSubmitting}
                  className={navyBtn}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Apply for Alumni Status
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {!canApply
                    ? `Semester ${eligibility?.current_semester ?? '—'} of ${eligibility?.max_semester ?? 8} — unlocks when all guardrails pass.`
                    : 'Complete LinkedIn and company fields to enable submit.'}
                </p>
              </div>
            </form>
          </>
        )}
      </StudentSectionCard>
    </div>
  );
}
