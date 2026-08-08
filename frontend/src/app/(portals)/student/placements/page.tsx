'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronRight,
  Lock,
  MapPin,
  Search,
} from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { PlacementApplicationTracker } from '@/components/placement/PlacementApplicationTracker';
import { PlacementApplyModal } from '@/components/placement/PlacementApplyModal';
import {
  StudentDeptDriveCard,
  useStudentDeptPlacementDrives,
  type DeptPlacementDrive,
} from '@/components/student/StudentDeptPlacementDrives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import type {
  PlacementApplication,
  PlacementDrive,
  PlacementEligibility,
  PlacementHub,
  PlacementPipelineStage,
} from '@/lib/placement';
import { DEMO_PLACEMENTS, DEMO_STUDENT } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { cn } from '@/lib/utils';

const DEMO_APPS_KEY = 'falcon.demo.placement.applications';

type DemoStoredApp = {
  application_id: string;
  drive_id: string;
  pipeline_stage: PlacementPipelineStage;
  applied_at: string;
  job_role: string;
  company_name: string;
  package_lpa: number;
  resume_file_path?: string;
};

function isApplyDisabled(eligibility?: PlacementEligibility) {
  if (eligibility?.already_applied) return true;
  return eligibility?.eligible === false;
}

function cgpaLabel(minCgpa: string | number | undefined) {
  return Number(minCgpa) <= 0 ? 'Open to all CGPA' : `Min CGPA ${Number(minCgpa).toFixed(2)}`;
}

function readDemoApps(): DemoStoredApp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(DEMO_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoStoredApp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDemoApps(apps: DemoStoredApp[]) {
  sessionStorage.setItem(DEMO_APPS_KEY, JSON.stringify(apps));
}

function buildDemoHub(extraApps: DemoStoredApp[] = []): PlacementHub {
  const appliedIds = new Set(extraApps.map((a) => a.drive_id));

  const open_drives: PlacementDrive[] = DEMO_PLACEMENTS.open_drives.map((d) => {
    const alreadyApplied = d.status !== 'OPEN' || appliedIds.has(d.drive_id);
    const minCgpa = d.min_cgpa ?? 6.5;
    return {
      drive_id: d.drive_id,
      company_name: d.company_name,
      job_role: d.job_role,
      package_lpa: d.package_lpa,
      min_cgpa: minCgpa,
      description: d.description ?? `${d.drive_type} opportunity at ${d.company_name} (${d.location}).`,
      deadline: d.deadline,
      eligibility: {
        eligible: true,
        cgpa: 8.42,
        backlogs: 0,
        min_cgpa: minCgpa,
        max_backlogs: 0,
        package_lpa: d.package_lpa,
        is_placement_locked: false,
        placement_offer_lpa: null,
        already_applied: alreadyApplied,
        reason: null,
      },
    };
  });

  const seedApps: PlacementApplication[] = DEMO_PLACEMENTS.open_drives
    .filter((d) => d.status !== 'OPEN')
    .map((d, i) => {
      const stageByStatus: Record<string, PlacementPipelineStage> = {
        APPLIED: 'APPLIED',
        INTERVIEW: 'TECH_INTERVIEW',
        OFFER: 'OFFERED',
        REJECTED: 'REJECTED',
      };
      return {
        application_id: `app-${d.drive_id}`,
        drive_id: d.drive_id,
        pipeline_stage: stageByStatus[d.status] ?? 'APPLIED',
        applied_at: new Date(Date.now() - (i + 1) * 86400000 * 3).toISOString(),
        job_role: d.job_role,
        company_name: d.company_name,
        package_lpa: d.package_lpa,
      };
    });

  const seedIds = new Set(seedApps.map((a) => a.drive_id));
  const my_applications = [
    ...extraApps
      .filter((a) => !seedIds.has(a.drive_id))
      .map(
        (a): PlacementApplication => ({
          application_id: a.application_id,
          drive_id: a.drive_id,
          pipeline_stage: a.pipeline_stage,
          applied_at: a.applied_at,
          job_role: a.job_role,
          company_name: a.company_name,
          package_lpa: a.package_lpa,
        }),
      ),
    ...seedApps,
  ].sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());

  return {
    open_drives,
    my_applications,
    student_cgpa: 8.42,
    student_backlogs: 0,
    placement_lock: { locked: false, offerLpa: null, reason: null },
  };
}

export default function StudentPlacementsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const demoOn = isStudentDemoModeEnabled();
  const { drives: deptDrives, loading: deptLoading, loadError: deptLoadError, reload: reloadDeptDrives } =
    useStudentDeptPlacementDrives();
  const [registeringDeptId, setRegisteringDeptId] = useState<string | null>(null);
  const [hub, setHub] = useState<PlacementHub | null>(null);
  const [hubDegraded, setHubDegraded] = useState(false);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState<PlacementDrive | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<PlacementApplication | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const fetchDriveEligibility = useCallback(
    async (driveId: string): Promise<PlacementEligibility> => {
      return api.get<PlacementEligibility>(`/api/placement/drives/${driveId}/eligibility`);
    },
    [api],
  );

  const enrichDrivesWithEligibility = useCallback(
    async (drives: PlacementDrive[]): Promise<PlacementDrive[]> => {
      if (drives.length === 0) return drives;
      return Promise.all(
        drives.map(async (drive) => {
          if (drive.eligibility) return drive;
          try {
            const eligibility = await fetchDriveEligibility(drive.drive_id);
            return { ...drive, eligibility };
          } catch {
            return drive;
          }
        }),
      );
    },
    [fetchDriveEligibility],
  );

  const ensureDriveEligibility = useCallback(
    async (drive: PlacementDrive): Promise<PlacementDrive> => {
      if (drive.eligibility) return drive;
      if (usingDemoData || drive.drive_id.startsWith('drv-')) {
        const enriched: PlacementDrive = {
          ...drive,
          eligibility: {
            eligible: true,
            cgpa: hub?.student_cgpa ?? 8.42,
            backlogs: hub?.student_backlogs ?? 0,
            min_cgpa: Number(drive.min_cgpa ?? 0),
            max_backlogs: 0,
            package_lpa: Number(drive.package_lpa ?? 0),
            is_placement_locked: Boolean(hub?.placement_lock?.locked),
            placement_offer_lpa: hub?.placement_lock?.offerLpa ?? null,
            already_applied: false,
            reason: null,
          },
        };
        setHub((prev) =>
          prev
            ? {
                ...prev,
                open_drives: prev.open_drives.map((d) =>
                  d.drive_id === drive.drive_id ? enriched : d,
                ),
              }
            : prev,
        );
        return enriched;
      }
      setEligibilityLoading(drive.drive_id);
      try {
        const eligibility = await fetchDriveEligibility(drive.drive_id);
        const enriched = { ...drive, eligibility };
        setHub((prev) =>
          prev
            ? {
                ...prev,
                open_drives: prev.open_drives.map((d) =>
                  d.drive_id === drive.drive_id ? enriched : d,
                ),
              }
            : prev,
        );
        return enriched;
      } finally {
        setEligibilityLoading(null);
      }
    },
    [fetchDriveEligibility, hub?.placement_lock, hub?.student_backlogs, hub?.student_cgpa, usingDemoData],
  );

  const load = useCallback(async () => {
    setHubDegraded(false);
    const emptyHub = (): PlacementHub => ({
      open_drives: [],
      my_applications: [],
      student_cgpa: 0,
      student_backlogs: 0,
      placement_lock: { locked: false, offerLpa: null, reason: null },
    });
    const fallbackHub = () => (demoOn ? buildDemoHub(readDemoApps()) : emptyHub());

    try {
      const data = await api.get<PlacementHub>('/api/placement/student/hub');
      if (!data.open_drives?.length && demoOn) {
        setUsingDemoData(true);
        setHub(fallbackHub());
      } else {
        setUsingDemoData(false);
        setHub(data);
      }
      const driveParam = searchParams.get('drive');
      if (driveParam) {
        const pool = data.open_drives?.length ? data.open_drives : fallbackHub().open_drives;
        const match = pool.find((d) => d.drive_id === driveParam);
        if (match) setSelectedDrive(match);
      }
    } catch {
      setHubDegraded(true);
      try {
        const fallback = await api.get<{
          open_jobs: Array<Record<string, unknown>>;
          my_applications: Array<Record<string, unknown>>;
        }>('/api/student/placements');
        const drives: PlacementDrive[] = (fallback.open_jobs ?? []).map((j) => ({
          drive_id: String(j.drive_id ?? j.jd_id ?? ''),
          company_name: String(j.company_name ?? ''),
          job_role: String(j.job_title ?? j.job_role ?? ''),
          package_lpa: (j.package_lpa as string | number | undefined) ?? 0,
          min_cgpa: j.min_cgpa as string | number,
          description: j.description as string | undefined,
          deadline: j.application_deadline as string | undefined,
        }));
        if (!drives.length) {
          setUsingDemoData(demoOn);
          setHub(fallbackHub());
          return;
        }
        setUsingDemoData(false);
        const enrichedDrives = await enrichDrivesWithEligibility(drives);
        setHub({
          open_drives: enrichedDrives,
          my_applications: (fallback.my_applications ?? []).map((a) => ({
            application_id: String(a.application_id),
            drive_id: String(a.drive_id ?? ''),
            pipeline_stage: String(
              a.status ?? 'APPLIED',
            ) as PlacementHub['my_applications'][0]['pipeline_stage'],
            applied_at: String(a.applied_at ?? ''),
            job_role: String(a.job_title ?? ''),
            company_name: String(a.company_name ?? ''),
          })),
          student_cgpa: 0,
          student_backlogs: 0,
          placement_lock: { locked: false, offerLpa: null, reason: null },
        });
      } catch {
        setUsingDemoData(demoOn);
        setHub(fallbackHub());
      }
    }
  }, [api, demoOn, searchParams, enrichDrivesWithEligibility]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyLocally(driveId: string, resumePath: string) {
    const drive =
      hub?.open_drives.find((d) => d.drive_id === driveId) ??
      DEMO_PLACEMENTS.open_drives.find((d) => d.drive_id === driveId);
    if (!drive) throw new Error('Drive not found');

    const stored = readDemoApps().filter((a) => a.drive_id !== driveId);
    const nextApp: DemoStoredApp = {
      application_id: `app-local-${driveId}`,
      drive_id: driveId,
      pipeline_stage: 'APPLIED',
      applied_at: new Date().toISOString(),
      job_role: drive.job_role,
      company_name: drive.company_name,
      package_lpa: Number(drive.package_lpa ?? 0),
      resume_file_path: resumePath,
    };
    writeDemoApps([nextApp, ...stored]);
    setUsingDemoData(true);
    setHub(buildDemoHub([nextApp, ...stored]));
  }

  async function applyToDrive(driveId: string, resumePath: string) {
    if (usingDemoData || driveId.startsWith('drv-')) {
      if (!demoOn) {
        throw new Error('Placement hub is unavailable. Try again when the server is online.');
      }
      applyLocally(driveId, resumePath);
    } else {
      await api.post(`/api/placement/drives/${driveId}/apply`, {
        resume_file_path: resumePath,
      });
      await load();
    }
    setSelectedDrive(null);
    setApplyOpen(false);
  }

  async function openApply(drive: PlacementDrive) {
    const enriched = await ensureDriveEligibility(drive);
    if (isApplyDisabled(enriched.eligibility)) {
      toast.error(enriched.eligibility?.reason || 'You cannot apply to this drive');
      return;
    }
    setSelectedDrive(enriched);
    setApplyOpen(true);
  }

  async function registerDeptDrive(
    drive: DeptPlacementDrive,
    afterGoogleForm: boolean,
    attestation?: { formOpenedAt: number },
  ) {
    setRegisteringDeptId(drive.drive_id);
    try {
      await api.post(`/api/academics/student/placement/drives/${drive.drive_id}/register`, {
        student_name: user?.name ?? DEMO_STUDENT.name,
        student_email: user?.email ?? DEMO_STUDENT.email,
        response_json: afterGoogleForm
          ? {
              source: 'GOOGLE_FORM_CONFIRMED',
              google_form_attested: true,
              form_opened_at: attestation?.formOpenedAt ?? null,
            }
          : { source: 'PORTAL' },
      });
      toast.success(
        afterGoogleForm
          ? 'Registration confirmed — your department coordinator can see you in Falcon'
          : `Registered for ${drive.company_name}`,
      );
      await reloadDeptDrives();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setRegisteringDeptId(null);
    }
  }

  async function selectDrive(drive: PlacementDrive) {
    const enriched = await ensureDriveEligibility(drive);
    setSelectedApplication(null);
    setSelectedDrive(enriched);
  }

  const registeredDeptDrives = deptDrives.filter((d) => d.registered);
  const hasCampusApplications = (hub?.my_applications ?? []).length > 0;
  const hasDeptRegistrations = registeredDeptDrives.length > 0;
  const hasAnyApplications = hasCampusApplications || hasDeptRegistrations;

  const filteredDrives = useMemo(() => {
    const q = query.trim().toLowerCase();
    const drives = hub?.open_drives ?? [];
    if (!q) return drives;
    return drives.filter((d) =>
      [d.job_role, d.company_name, d.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [hub?.open_drives, query]);

  const openCount = (hub?.open_drives ?? []).filter((d) => !d.eligibility?.already_applied).length;
  const appliedCount = (hub?.my_applications ?? []).length + registeredDeptDrives.length;
  const interviewCount = (hub?.my_applications ?? []).filter((a) =>
    ['APTITUDE_CLEARED', 'TECH_INTERVIEW', 'HR_INTERVIEW'].includes(a.pipeline_stage),
  ).length;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Placements"
        description="Browse campus drives, apply with your resume, and track your interview pipeline."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Open for you', value: openCount },
          { label: 'Applications', value: appliedCount },
          { label: 'In interview', value: interviewCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-sgvu-navy/10 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-black text-sgvu-navy">{stat.value}</p>
          </div>
        ))}
      </div>

      {hubDegraded && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Live hub unavailable — showing working campus drives so you can still apply and track.</p>
        </div>
      )}

      {hub?.placement_lock?.locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Placement policy active</p>
            <p>
              {hub.placement_lock.reason ??
                `You hold a Tier-1 offer of ₹${hub.placement_lock.offerLpa} LPA.`}
            </p>
          </div>
        </div>
      )}

      <StudentSectionCard
        title="Open positions"
        description="Campus recruitment drives and department placement drives from your coordinator"
        icon={Building2}
        action={
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles or companies"
              className="h-10 rounded-xl pl-9"
              aria-label="Search open positions"
            />
          </div>
        }
      >
        {deptLoadError ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Department drives could not load: {deptLoadError}
          </p>
        ) : null}

        {deptLoading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading department drives…</p>
        ) : null}

        {!deptLoading && deptDrives.length === 0 && filteredDrives.length === 0 ? (
          <StudentEmptyState
            title={query ? 'No matching drives' : 'No open drives'}
            description={
              query
                ? 'Try another company or role name.'
                : 'Department coordinator drives and campus placement opportunities will appear here.'
            }
          />
        ) : (
          <div className="space-y-3">
            {deptDrives.map((drive) => (
              <StudentDeptDriveCard
                key={drive.drive_id}
                drive={drive}
                registeringId={registeringDeptId}
                onRegister={(d, after, att) => void registerDeptDrive(d, after, att)}
                compact
              />
            ))}

            {filteredDrives.map((drive) => {
              const elig = drive.eligibility;
              const applied = elig?.already_applied;
              const canApply = !isApplyDisabled(elig);
              const deadline = drive.deadline ?? drive.drive_date;
              const checkingEligibility = eligibilityLoading === drive.drive_id;
              const demoMeta = DEMO_PLACEMENTS.open_drives.find((d) => d.drive_id === drive.drive_id);

              return (
                <div
                  key={drive.drive_id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-navy/30 hover:shadow-sm"
                  onClick={() => void selectDrive(drive)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void selectDrive(drive);
                    }
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sgvu-navy">{drive.job_role}</p>
                      {demoMeta?.drive_type === 'INTERNSHIP' ? (
                        <Badge className="border border-sgvu-navy/15 bg-sgvu-navy/5 text-[10px] text-sgvu-navy">
                          Internship
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {drive.company_name} · ₹{Number(drive.package_lpa ?? 0).toFixed(1)} LPA ·{' '}
                      {cgpaLabel(drive.min_cgpa)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {demoMeta?.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {demoMeta.location}
                        </span>
                      ) : null}
                      {deadline ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Apply before {new Date(deadline).toLocaleDateString('en-IN')}
                        </span>
                      ) : null}
                    </div>
                    {elig && elig.eligible === false && elig.reason ? (
                      <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                        {elig.reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
                    {applied ? (
                      <Button
                        size="sm"
                        disabled
                        className="bg-sgvu-navy text-white opacity-100 disabled:opacity-100"
                      >
                        Applied
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-sgvu-navy text-white hover:bg-[#123A6D]"
                        disabled={!canApply || checkingEligibility}
                        onClick={(e) => {
                          e.stopPropagation();
                          void openApply(drive);
                        }}
                      >
                        {checkingEligibility ? 'Checking…' : 'Apply Now'}
                      </Button>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      View details
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard
        title="My applications"
        description="Campus pipeline and your department drive registrations"
        icon={Briefcase}
      >
        {!hasAnyApplications ? (
          <StudentEmptyState
            title="No applications yet"
            description="Register for department drives or apply to campus positions above — they will show here."
          />
        ) : (
          <div className="space-y-4">
            {registeredDeptDrives.map((drive) => (
              <div
                key={`dept-${drive.drive_id}`}
                className="rounded-2xl border border-sgvu-navy/20 bg-sgvu-navy/[0.02] p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge className="border border-sgvu-navy/20 bg-sgvu-navy/10 text-[10px] text-sgvu-navy">
                        Dept drive
                      </Badge>
                    </div>
                    <p className="font-semibold text-sgvu-navy">
                      {drive.job_role || drive.company_name}
                    </p>
                    <p className="text-sm text-muted-foreground">{drive.company_name}</p>
                    {drive.registered_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Registered {new Date(drive.registered_at).toLocaleString('en-IN')}
                      </p>
                    ) : null}
                  </div>
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                    Registered
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                    ✓
                  </span>
                  <span>
                    Coordinator has your registration
                    {drive.drive_date
                      ? ` · Drive on ${new Date(drive.drive_date).toLocaleDateString('en-IN')}`
                      : ''}
                  </span>
                </div>
              </div>
            ))}

            {(hub?.my_applications ?? []).map((a) => (
              <button
                key={a.application_id}
                type="button"
                className="w-full rounded-2xl border border-border/70 bg-white p-4 text-left transition hover:border-sgvu-navy/30 hover:shadow-sm"
                onClick={() => {
                  setSelectedDrive(null);
                  setSelectedApplication(a);
                }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sgvu-navy">{a.job_role}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.company_name}
                      {a.package_lpa != null
                        ? ` · ₹${Number(a.package_lpa).toFixed(1)} LPA`
                        : ''}
                    </p>
                    {a.applied_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applied {new Date(a.applied_at).toLocaleDateString('en-IN')}
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      a.pipeline_stage === 'OFFERED'
                        ? 'default'
                        : a.pipeline_stage === 'REJECTED'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className={cn(
                      a.pipeline_stage !== 'OFFERED' &&
                        a.pipeline_stage !== 'REJECTED' &&
                        'bg-sgvu-gold/20 text-sgvu-navy',
                    )}
                  >
                    {a.pipeline_stage.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <PlacementApplicationTracker
                  stage={a.pipeline_stage}
                  rejectedAtStage={a.rejected_at_stage}
                />
              </button>
            ))}
          </div>
        )}
      </StudentSectionCard>

      {selectedDrive && !applyOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setSelectedDrive(null)}
        >
          <div
            className="max-h-[min(92dvh,85vh)] w-[calc(100%-1.25rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:w-full sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-sgvu-navy">{selectedDrive.job_role}</h3>
            <p className="text-sm text-muted-foreground">{selectedDrive.company_name}</p>
            {selectedDrive.description ? (
              <p className="mt-4 text-sm leading-relaxed text-foreground/90">
                {selectedDrive.description}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Package</p>
                <p className="font-bold">₹{Number(selectedDrive.package_lpa ?? 0).toFixed(1)} LPA</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Min CGPA</p>
                <p className="font-bold">{cgpaLabel(selectedDrive.min_cgpa)}</p>
              </div>
              {(selectedDrive.deadline || selectedDrive.drive_date) && (
                <div className="col-span-2 rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Deadline</p>
                  <p className="font-bold">
                    {new Date(
                      (selectedDrive.deadline || selectedDrive.drive_date) as string,
                    ).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
            </div>
            {selectedDrive.eligibility?.already_applied ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                You have already applied. Track progress under My applications.
              </div>
            ) : null}
            {selectedDrive.eligibility &&
            selectedDrive.eligibility.eligible === false &&
            !selectedDrive.eligibility.already_applied ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {selectedDrive.eligibility.reason}
              </div>
            ) : null}
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedDrive(null)}>
                Close
              </Button>
              {!selectedDrive.eligibility?.already_applied ? (
                <Button
                  className="flex-1 bg-sgvu-navy text-white hover:bg-[#123A6D]"
                  disabled={
                    isApplyDisabled(selectedDrive.eligibility) ||
                    eligibilityLoading === selectedDrive.drive_id
                  }
                  onClick={() => setApplyOpen(true)}
                >
                  {eligibilityLoading === selectedDrive.drive_id ? 'Checking…' : 'Apply Now'}
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-sgvu-navy text-white hover:bg-[#123A6D]"
                  onClick={() => {
                    const app = hub?.my_applications.find(
                      (a) => a.drive_id === selectedDrive.drive_id,
                    );
                    setSelectedDrive(null);
                    if (app) setSelectedApplication(app);
                  }}
                >
                  View pipeline
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedApplication && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setSelectedApplication(null)}
        >
          <div
            className="max-h-[min(92dvh,85vh)] w-[calc(100%-1.25rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:w-full sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-sgvu-navy">{selectedApplication.job_role}</h3>
            <p className="text-sm text-muted-foreground">{selectedApplication.company_name}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Package</p>
                <p className="font-bold">
                  {selectedApplication.package_lpa != null
                    ? `₹${Number(selectedApplication.package_lpa).toFixed(1)} LPA`
                    : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Applied on</p>
                <p className="font-bold">
                  {selectedApplication.applied_at
                    ? new Date(selectedApplication.applied_at).toLocaleDateString('en-IN')
                    : '—'}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pipeline status
              </p>
              <PlacementApplicationTracker
                stage={selectedApplication.pipeline_stage}
                rejectedAtStage={selectedApplication.rejected_at_stage}
              />
            </div>
            <div className="mt-6">
              <Button
                className="w-full bg-sgvu-navy text-white hover:bg-[#123A6D]"
                onClick={() => setSelectedApplication(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <PlacementApplyModal
        drive={selectedDrive}
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        applyFn={applyToDrive}
      />
    </StudentPageShell>
  );
}
