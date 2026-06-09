'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Briefcase, Building2, ChevronRight, Lock } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { PlacementApplicationTracker } from '@/components/placement/PlacementApplicationTracker';
import { PlacementApplyModal } from '@/components/placement/PlacementApplyModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import type { PlacementDrive, PlacementEligibility, PlacementHub } from '@/lib/placement';

function isApplyDisabled(eligibility?: PlacementEligibility) {
  if (eligibility?.already_applied) return true;
  return eligibility?.eligible === false;
}

function cgpaLabel(minCgpa: string | number | undefined) {
  return Number(minCgpa) <= 0 ? 'Open to all CGPA' : `Min CGPA ${Number(minCgpa).toFixed(2)}`;
}

export default function StudentPlacementsPage() {
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const [hub, setHub] = useState<PlacementHub | null>(null);
  const [hubDegraded, setHubDegraded] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState<PlacementDrive | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState<string | null>(null);

  const fetchDriveEligibility = useCallback(
    async (driveId: string): Promise<PlacementEligibility> => {
      return api.get<PlacementEligibility>(`/api/placement/drives/${driveId}/eligibility`);
    },
    [api],
  );

  const enrichDrivesWithEligibility = useCallback(
    async (drives: PlacementDrive[]): Promise<PlacementDrive[]> => {
      if (drives.length === 0) return drives;
      const enriched = await Promise.all(
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
      return enriched;
    },
    [fetchDriveEligibility],
  );

  const ensureDriveEligibility = useCallback(
    async (drive: PlacementDrive): Promise<PlacementDrive> => {
      if (drive.eligibility) return drive;
      setEligibilityLoading(drive.drive_id);
      try {
        const eligibility = await fetchDriveEligibility(drive.drive_id);
        const enriched = { ...drive, eligibility };
        setHub((prev) =>
          prev
            ? {
                ...prev,
                open_drives: prev.open_drives.map((d) => (d.drive_id === drive.drive_id ? enriched : d)),
              }
            : prev,
        );
        return enriched;
      } finally {
        setEligibilityLoading(null);
      }
    },
    [fetchDriveEligibility],
  );

  const load = useCallback(async () => {
    setHubDegraded(false);
    try {
      const data = await api.get<PlacementHub>('/api/placement/student/hub');
      setHub(data);
      const driveParam = searchParams.get('drive');
      if (driveParam) {
        const match = data.open_drives.find((d) => d.drive_id === driveParam);
        if (match) setSelectedDrive(match);
      }
    } catch {
      setHubDegraded(true);
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
      const enrichedDrives = await enrichDrivesWithEligibility(drives);
      setHub({
        open_drives: enrichedDrives,
        my_applications: (fallback.my_applications ?? []).map((a) => ({
          application_id: String(a.application_id),
          drive_id: String(a.drive_id ?? ''),
          pipeline_stage: String(a.status ?? 'APPLIED') as PlacementHub['my_applications'][0]['pipeline_stage'],
          applied_at: String(a.applied_at ?? ''),
          job_role: String(a.job_title ?? ''),
          company_name: String(a.company_name ?? ''),
        })),
        student_cgpa: 0,
        student_backlogs: 0,
        placement_lock: { locked: false, offerLpa: null, reason: null },
      });
    }
  }, [api, searchParams, enrichDrivesWithEligibility]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyToDrive(driveId: string, resumePath: string) {
    await api.post(`/api/placement/drives/${driveId}/apply`, { resume_file_path: resumePath });
    await load();
    setSelectedDrive(null);
    setApplyOpen(false);
  }

  async function openApply(drive: PlacementDrive) {
    const enriched = await ensureDriveEligibility(drive);
    setSelectedDrive(enriched);
    setApplyOpen(true);
  }

  async function selectDrive(drive: PlacementDrive) {
    const enriched = await ensureDriveEligibility(drive);
    setSelectedDrive(enriched);
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Placements Hub"
        description="Browse campus drives, apply in one click, and track your interview pipeline."
      />

      {hubDegraded && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Could not load full hub — checking eligibility per drive.</p>
        </div>
      )}

      {hub?.placement_lock?.locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Placement policy active</p>
            <p>{hub.placement_lock.reason ?? `You hold a Tier-1 offer of ₹${hub.placement_lock.offerLpa} LPA.`}</p>
          </div>
        </div>
      )}

      <StudentSectionCard title="My applications" description="Swiggy-style pipeline tracker" icon={Briefcase}>
        {(hub?.my_applications ?? []).length === 0 ? (
          <StudentEmptyState title="No applications yet" description="Apply to open positions below when campus drives are active." />
        ) : (
          <div className="space-y-4">
            {(hub?.my_applications ?? []).map((a) => (
              <div
                key={a.application_id}
                className="rounded-2xl border border-border/70 bg-white p-4 transition hover:border-sgvu-gold/40"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sgvu-navy">{a.job_role}</p>
                    <p className="text-sm text-muted-foreground">{a.company_name}</p>
                  </div>
                  <Badge variant={a.pipeline_stage === 'OFFERED' ? 'default' : a.pipeline_stage === 'REJECTED' ? 'destructive' : 'secondary'}>
                    {a.pipeline_stage.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <PlacementApplicationTracker stage={a.pipeline_stage} rejectedAtStage={a.rejected_at_stage} />
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard title="Open positions" description="Active campus recruitment drives" icon={Building2}>
        {(hub?.open_drives ?? []).length === 0 ? (
          <StudentEmptyState title="No open drives" description="New placement opportunities will appear here when announced." />
        ) : (
          <div className="space-y-3">
            {(hub?.open_drives ?? []).map((drive) => {
              const elig = drive.eligibility;
              const applied = elig?.already_applied;
              const canApply = !isApplyDisabled(elig);
              const deadline = drive.deadline ?? drive.drive_date;
              const checkingEligibility = eligibilityLoading === drive.drive_id;

              return (
                <div
                  key={drive.drive_id}
                  className="cursor-pointer rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40"
                  onClick={() => void selectDrive(drive)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sgvu-navy">{drive.job_role}</p>
                      <p className="text-muted-foreground">
                        {drive.company_name} · ₹{Number(drive.package_lpa ?? 0).toFixed(1)} LPA · {cgpaLabel(drive.min_cgpa)}
                      </p>
                      {deadline && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Apply before {new Date(deadline).toLocaleDateString()}
                        </p>
                      )}
                      {elig && elig.eligible === false && elig.reason && (
                        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{elig.reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {applied ? (
                        <Badge>Applied</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90"
                          disabled={!canApply || checkingEligibility}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openApply(drive);
                          }}
                        >
                          {checkingEligibility ? 'Checking…' : 'Apply Now'}
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </StudentSectionCard>

      {selectedDrive && !applyOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setSelectedDrive(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-sgvu-navy">{selectedDrive.job_role}</h3>
            <p className="text-sm text-muted-foreground">{selectedDrive.company_name}</p>
            {selectedDrive.description && <p className="mt-4 text-sm leading-relaxed">{selectedDrive.description}</p>}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Package</p>
                <p className="font-bold">₹{Number(selectedDrive.package_lpa ?? 0).toFixed(1)} LPA</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Min CGPA</p>
                <p className="font-bold">{cgpaLabel(selectedDrive.min_cgpa)}</p>
              </div>
            </div>
            {selectedDrive.eligibility && selectedDrive.eligibility.eligible === false && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {selectedDrive.eligibility.reason}
              </div>
            )}
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedDrive(null)}>
                Close
              </Button>
              {!selectedDrive.eligibility?.already_applied && (
                <Button
                  className="flex-1 bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90"
                  disabled={isApplyDisabled(selectedDrive.eligibility) || eligibilityLoading === selectedDrive.drive_id}
                  onClick={() => setApplyOpen(true)}
                >
                  {eligibilityLoading === selectedDrive.drive_id ? 'Checking…' : 'Apply Now'}
                </Button>
              )}
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
