'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FileText,
  GraduationCap,
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
  pendingApprovals: number;
  verificationRequests: number;
  documentsPending: number;
  healthScore: number;
  liveFields: number;
  totalFields: number;
};

type DeskKpis = {
  total_students: number;
  total_faculty: number;
  active_departments: number;
  admissions_today: number;
  pending_approvals: number;
  verification_requests: number;
  documents_pending: number;
  pending_registrations?: number;
  pending_petitions?: number;
  pending_certificates?: number;
  pending_governance?: number;
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
  admissionsDeltaLabel: 'Leads created today (live)',
  admissionsTrendPositive: true,
  pendingApprovals: 0,
  verificationRequests: 0,
  documentsPending: 0,
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
    totalFields: 8,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kpis = await api.get<DeskKpis>(REGISTRAR_DESK.dashboardKpis);
      const pendingLabel = [
        kpis.pending_registrations != null ? `${kpis.pending_registrations} regs` : null,
        kpis.pending_petitions != null ? `${kpis.pending_petitions} petitions` : null,
        kpis.pending_certificates != null ? `${kpis.pending_certificates} certs` : null,
        kpis.pending_governance != null ? `${kpis.pending_governance} governance` : null,
      ]
        .filter(Boolean)
        .join(' · ');

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
        admissionsDeltaLabel: 'Leads created today (live)',
        admissionsTrendPositive: true,
        pendingApprovals: kpis.pending_approvals ?? 0,
        verificationRequests: kpis.verification_requests ?? 0,
        documentsPending: kpis.documents_pending ?? 0,
        healthScore: kpis.health_score ?? 0,
        liveFields: 8,
        totalFields: 8,
      };

      if (pendingLabel) {
        next.studentsDeltaLabel = `${next.totalStudents.toLocaleString('en-IN')} active`;
      }

      setSnapshot(next);
      onSnapshot?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load KPIs');
      setSnapshot({ ...EMPTY, liveFields: 0, totalFields: 8 });
    } finally {
      setLoading(false);
    }
  }, [api, onSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  const coverage = Math.round((snapshot.liveFields / snapshot.totalFields) * 100);

  return (
    <section className="space-y-4" aria-label="Registrar operational KPIs">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Operations pulse
            </p>
            <h3 className="mt-1 text-lg font-bold text-sgvu-navy sm:text-xl">
              University KPI overview
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {error
                ? `Unable to load live KPIs — ${error}`
                : snapshot.liveFields === 0
                  ? 'Loading registrar desk metrics…'
                  : `${snapshot.liveFields}/${snapshot.totalFields} metrics live · ${coverage}% coverage · Pending = regs + petitions + certs + governance`}
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RegistrarKpiCard
          title="Total Students"
          subtitle="Active student role accounts"
          value={snapshot.totalStudents}
          trendLabel={snapshot.studentsDeltaLabel}
          trendPositive={snapshot.studentsTrendPositive}
          href="/directory"
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
          href="/admin/academics"
          icon={Building2}
          accent="emerald"
          loading={loading}
        />
        <RegistrarKpiCard
          title="Admissions Today"
          subtitle="Leads created today (live)"
          value={snapshot.admissionsToday}
          trendLabel={snapshot.admissionsDeltaLabel}
          trendPositive={snapshot.admissionsTrendPositive}
          href="/admin/admissions"
          icon={UserPlus}
          accent="green"
          loading={loading}
        />
        <RegistrarKpiCard
          title="Pending Approvals"
          subtitle="Registrar desk queues"
          value={snapshot.pendingApprovals}
          trendLabel="Regs · petitions · certs · governance"
          trendPositive={snapshot.pendingApprovals < 15}
          href="/admin/semester-registrations"
          icon={ClipboardCheck}
          accent="amber"
          loading={loading}
        />
        <RegistrarKpiCard
          title="Verification Requests"
          subtitle="Pending admin approval"
          value={snapshot.verificationRequests}
          trendLabel={
            snapshot.verificationRequests === 0
              ? 'Queue clear'
              : 'Pending student verifications'
          }
          trendPositive={snapshot.verificationRequests < 20}
          href="/admin/verifications"
          icon={BadgeCheck}
          accent="orange"
          loading={loading}
        />
        <RegistrarKpiCard
          title="Documents Pending"
          subtitle="Failed imports + petition docs"
          value={snapshot.documentsPending}
          trendLabel="Bulk / petition intake"
          trendPositive={snapshot.documentsPending < 10}
          href="/admin/upload-history"
          icon={FileText}
          accent="purple"
          loading={loading}
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
    </section>
  );
}
