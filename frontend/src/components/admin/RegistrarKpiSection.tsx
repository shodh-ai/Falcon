'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  ScrollText,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { RegistrarHealthGauge } from '@/components/admin/RegistrarHealthGauge';
import { RegistrarKpiCard } from '@/components/admin/RegistrarKpiCard';

export type RegistrarKpiSnapshot = {
  totalStudents: number;
  studentsDeltaLabel: string;
  studentsTrendPositive: boolean;
  totalFaculty: number;
  facultyDeltaLabel: string;
  facultyTrendPositive: boolean;
  activeDepartments: number;
  departmentsDeltaLabel: string;
  departmentsTrendPositive: boolean;
  admissionsToday: number;
  admissionsDeltaLabel: string;
  admissionsTrendPositive: boolean;
  pendingEnrollments: number;
  pendingApprovals: number;
  verificationRequests: number;
  documentsPending: number;
  pendingRegistrations: number;
  pendingPetitions: number;
  pendingCertificates: number;
  pendingGovernance: number;
  pendingDegreeEligibility: number;
  healthScore: number;
  liveFields: number;
  totalFields: number;
};

type DeskKpis = {
  total_students: number;
  total_faculty: number;
  active_departments: number;
  admissions_today: number;
  pending_enrollments?: number;
  pending_approvals: number;
  verification_requests: number;
  documents_pending: number;
  pending_registrations?: number;
  pending_petitions?: number;
  pending_certificates?: number;
  pending_governance?: number;
  pending_degree_eligibility?: number;
  health_score: number;
};

const EMPTY: Omit<RegistrarKpiSnapshot, 'liveFields' | 'totalFields'> = {
  totalStudents: 0,
  studentsDeltaLabel: 'Active student accounts',
  studentsTrendPositive: true,
  totalFaculty: 0,
  facultyDeltaLabel: 'Faculty / HOD / Dean',
  facultyTrendPositive: true,
  activeDepartments: 0,
  departmentsDeltaLabel: 'Departments in tenant',
  departmentsTrendPositive: true,
  admissionsToday: 0,
  admissionsDeltaLabel: 'Leads created today',
  admissionsTrendPositive: true,
  pendingEnrollments: 0,
  pendingApprovals: 0,
  verificationRequests: 0,
  documentsPending: 0,
  pendingRegistrations: 0,
  pendingPetitions: 0,
  pendingCertificates: 0,
  pendingGovernance: 0,
  pendingDegreeEligibility: 0,
  healthScore: 0,
};

export function RegistrarKpiSection({
  onSnapshot,
}: {
  onSnapshot?: (snapshot: RegistrarKpiSnapshot) => void;
}) {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RegistrarKpiSnapshot>({
    ...EMPTY,
    liveFields: 0,
    totalFields: 10,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kpis = await api.get<DeskKpis>(REGISTRAR_DESK.dashboardKpis);
      const pendingRegs = kpis.pending_registrations ?? 0;
      const pendingPetitions = kpis.pending_petitions ?? 0;
      const pendingCerts = kpis.pending_certificates ?? 0;
      const pendingGov = kpis.pending_governance ?? 0;
      const pendingDegree = kpis.pending_degree_eligibility ?? 0;
      const pendingEnroll = kpis.pending_enrollments ?? 0;

      const next: RegistrarKpiSnapshot = {
        totalStudents: kpis.total_students ?? 0,
        studentsDeltaLabel: 'Active student accounts',
        studentsTrendPositive: true,
        totalFaculty: kpis.total_faculty ?? 0,
        facultyDeltaLabel: 'Faculty / HOD / Dean',
        facultyTrendPositive: true,
        activeDepartments: kpis.active_departments ?? 0,
        departmentsDeltaLabel: 'Departments in tenant',
        departmentsTrendPositive: true,
        admissionsToday: kpis.admissions_today ?? 0,
        admissionsDeltaLabel:
          pendingEnroll > 0
            ? `${pendingEnroll} fee-paid awaiting enroll`
            : 'Leads created today',
        admissionsTrendPositive: true,
        pendingEnrollments: pendingEnroll,
        pendingApprovals: kpis.pending_approvals ?? 0,
        verificationRequests: kpis.verification_requests ?? 0,
        documentsPending: kpis.documents_pending ?? 0,
        pendingRegistrations: pendingRegs,
        pendingPetitions,
        pendingCertificates: pendingCerts,
        pendingGovernance: pendingGov,
        pendingDegreeEligibility: pendingDegree,
        healthScore: kpis.health_score ?? 0,
        liveFields: 10,
        totalFields: 10,
      };

      setSnapshot(next);
      onSnapshot?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load KPIs');
      setSnapshot({ ...EMPTY, liveFields: 0, totalFields: 10 });
      onSnapshot?.({ ...EMPTY, liveFields: 0, totalFields: 10 });
    } finally {
      setLoading(false);
    }
  }, [api, onSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  const coverage = Math.round((snapshot.liveFields / snapshot.totalFields) * 100);
  const actionCount =
    snapshot.pendingApprovals +
    snapshot.verificationRequests +
    snapshot.documentsPending +
    snapshot.pendingEnrollments;

  const approvalsTrend =
    [
      snapshot.pendingRegistrations ? `${snapshot.pendingRegistrations} regs` : null,
      snapshot.pendingPetitions ? `${snapshot.pendingPetitions} petitions` : null,
      snapshot.pendingCertificates ? `${snapshot.pendingCertificates} certs` : null,
      snapshot.pendingDegreeEligibility
        ? `${snapshot.pendingDegreeEligibility} degrees`
        : null,
      snapshot.pendingGovernance ? `${snapshot.pendingGovernance} governance` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'All desk queues clear';

  return (
    <section className="space-y-4" aria-label="Registrar operational KPIs">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus snapshot
            </p>
            <h3 className="mt-1 text-lg font-bold text-sgvu-navy sm:text-xl">
              University KPI overview
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {error
                ? `Unable to load live KPIs — ${error}`
                : loading && snapshot.liveFields === 0
                  ? 'Loading registrar desk metrics…'
                  : `${snapshot.liveFields}/${snapshot.totalFields} metrics live · ${coverage}% coverage${
                      actionCount > 0
                        ? ` · ${actionCount} queue item${actionCount === 1 ? '' : 's'} need action`
                        : ' · Queues look healthy'
                    }`}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="border border-[#0B2447] bg-[#0B2447] px-4 font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}. Showing zeros until refresh succeeds.
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          People & structure — click a card to open
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RegistrarKpiCard
            title="Total Students"
            subtitle="Active student role accounts"
            value={snapshot.totalStudents}
            trendLabel={snapshot.studentsDeltaLabel}
            trendPositive={snapshot.studentsTrendPositive}
            href="/admin/student-records"
            icon={GraduationCap}
            accent="blue"
            loading={loading}
          />
          <RegistrarKpiCard
            title="Total Faculty"
            subtitle="Faculty, HOD, and Dean"
            value={snapshot.totalFaculty}
            trendLabel={snapshot.facultyDeltaLabel}
            trendPositive={snapshot.facultyTrendPositive}
            href="/directory"
            icon={Users}
            accent="indigo"
            loading={loading}
          />
          <RegistrarKpiCard
            title="Active Departments"
            subtitle="Departments in tenant"
            value={snapshot.activeDepartments}
            trendLabel={snapshot.departmentsDeltaLabel}
            trendPositive={snapshot.departmentsTrendPositive}
            href="/admin/departments"
            icon={Building2}
            accent="emerald"
            loading={loading}
          />
          <RegistrarKpiCard
            title="Intake Today"
            subtitle="New admissions leads today"
            value={snapshot.admissionsToday}
            trendLabel={snapshot.admissionsDeltaLabel}
            trendPositive={snapshot.admissionsTrendPositive}
            href="/admin/enrollment"
            icon={UserPlus}
            accent="green"
            loading={loading}
            emphasize={snapshot.pendingEnrollments > 0}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Desk queues — prioritise orange / amber cards
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RegistrarKpiCard
            title="Pending Approvals"
            subtitle="Regs · petitions · certs · degrees · governance"
            value={snapshot.pendingApprovals}
            trendLabel={approvalsTrend}
            trendPositive={snapshot.pendingApprovals < 15}
            href="/admin/tasks"
            icon={ClipboardCheck}
            accent="amber"
            loading={loading}
            emphasize={snapshot.pendingApprovals > 0}
          />
          <RegistrarKpiCard
            title="Verification Requests"
            subtitle="Pending admin approval"
            value={snapshot.verificationRequests}
            trendLabel={
              snapshot.verificationRequests === 0
                ? 'Queue clear'
                : 'Pending student / staff verifications'
            }
            trendPositive={snapshot.verificationRequests < 20}
            href="/admin/verifications"
            icon={BadgeCheck}
            accent="orange"
            loading={loading}
            emphasize={snapshot.verificationRequests > 0}
          />
          <RegistrarKpiCard
            title="Documents Pending"
            subtitle="Failed imports + petition attachments"
            value={snapshot.documentsPending}
            trendLabel={
              snapshot.pendingPetitions > 0
                ? `${snapshot.pendingPetitions} petition(s) with docs`
                : 'Bulk / petition intake'
            }
            trendPositive={snapshot.documentsPending < 10}
            href="/admin/academic-petitions"
            icon={FileText}
            accent="purple"
            loading={loading}
            emphasize={snapshot.documentsPending > 0}
          />
          <RegistrarKpiCard
            title="University Health Score"
            subtitle="Operational readiness (0–100)"
            value={`${snapshot.healthScore}`}
            trendLabel={
              snapshot.healthScore >= 90
                ? 'Excellent operational posture'
                : snapshot.healthScore >= 70
                  ? 'Stable — monitor queues'
                  : 'Needs attention'
            }
            trendPositive={snapshot.healthScore >= 70}
            href="/admin/registrar-reports"
            icon={Activity}
            accent="health"
            loading={loading}
            trailing={
              loading ? null : <RegistrarHealthGauge score={snapshot.healthScore} size={68} />
            }
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Pipeline status — live desk counts
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <RegistrarKpiCard
            title="Awaiting Enrollment"
            subtitle="Fee-verified leads not enrolled"
            value={snapshot.pendingEnrollments}
            trendLabel={snapshot.pendingEnrollments === 0 ? 'Enrollment clear' : 'Open enrollment desk'}
            trendPositive={snapshot.pendingEnrollments < 10}
            href="/admin/enrollment"
            icon={UserPlus}
            accent="green"
            loading={loading}
            emphasize={snapshot.pendingEnrollments > 0}
          />
          <RegistrarKpiCard
            title="Semester Registrations"
            subtitle="Submitted / pending / sent back"
            value={snapshot.pendingRegistrations}
            trendLabel={
              snapshot.pendingRegistrations === 0 ? 'No pending regs' : 'Review registrations'
            }
            trendPositive={snapshot.pendingRegistrations < 15}
            href="/admin/semester-registrations"
            icon={ClipboardCheck}
            accent="amber"
            loading={loading}
            emphasize={snapshot.pendingRegistrations > 0}
          />
          <RegistrarKpiCard
            title="Certificate Requests"
            subtitle="Draft / generated awaiting issue"
            value={snapshot.pendingCertificates}
            trendLabel={
              snapshot.pendingCertificates === 0 ? 'Certificate desk clear' : 'Open certificate desk'
            }
            trendPositive={snapshot.pendingCertificates < 10}
            href="/admin/certificates"
            icon={ScrollText}
            accent="blue"
            loading={loading}
            emphasize={snapshot.pendingCertificates > 0}
          />
          <RegistrarKpiCard
            title="Degree Eligibility"
            subtitle="Eligible — awaiting Registrar decision"
            value={snapshot.pendingDegreeEligibility}
            trendLabel={
              snapshot.pendingDegreeEligibility === 0
                ? 'No pending decisions'
                : 'Approve or reject eligibility'
            }
            trendPositive={snapshot.pendingDegreeEligibility < 10}
            href="/admin/degree-eligibility"
            icon={BadgeCheck}
            accent="indigo"
            loading={loading}
            emphasize={snapshot.pendingDegreeEligibility > 0}
          />
          <RegistrarKpiCard
            title="Governance Tasks"
            subtitle="Pending university governance"
            value={snapshot.pendingGovernance}
            trendLabel={
              snapshot.pendingGovernance === 0 ? 'Governance clear' : 'Open governance tasks'
            }
            trendPositive={snapshot.pendingGovernance < 10}
            href="/admin/tasks"
            icon={ClipboardCheck}
            accent="orange"
            loading={loading}
            emphasize={snapshot.pendingGovernance > 0}
          />
        </div>
      </div>
    </section>
  );
}
