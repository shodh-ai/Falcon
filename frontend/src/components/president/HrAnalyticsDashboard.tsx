'use client';

import { useEffect, useMemo, useState } from 'react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useAuthedApi } from '@/lib/api';
import { HR_KPI } from './hrMockData';

type HrAnalyticsApi = {
  faculty_retention_rate?: number;
  faculty_to_student_ratio?: number;
  total_payroll_expense?: number;
};

const FALLBACK: HrAnalyticsApi = {
  faculty_retention_rate: HR_KPI.retentionRate,
  faculty_to_student_ratio: HR_KPI.facultyStudentRatio.studentsPerFaculty,
  total_payroll_expense: HR_KPI.monthlyPayroll.amount,
};

function formatPayroll(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Clean HR Analytics view — Falcon Workspace header + three KPI cards (matches legacy workspace layout).
 */
export function HrAnalyticsDashboard() {
  const api = useAuthedApi();
  const [data, setData] = useState<HrAnalyticsApi>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const result = await api.get<HrAnalyticsApi>('/api/president/hr-analytics');
        setData({
          faculty_retention_rate: result?.faculty_retention_rate ?? FALLBACK.faculty_retention_rate,
          faculty_to_student_ratio: result?.faculty_to_student_ratio ?? FALLBACK.faculty_to_student_ratio,
          total_payroll_expense: result?.total_payroll_expense ?? FALLBACK.total_payroll_expense,
        });
      } catch {
        setData(FALLBACK);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const kpis = useMemo(
    () => [
      {
        label: 'Retention Rate',
        value: `${data.faculty_retention_rate ?? 0}%`,
      },
      {
        label: 'Faculty Student Ratio',
        value: String(data.faculty_to_student_ratio ?? '—'),
      },
      {
        label: 'Payroll Expense',
        value: formatPayroll(data.total_payroll_expense ?? 0),
      },
    ],
    [data],
  );

  if (loading) return <FalconLoader label="Loading HR Analytics…" />;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <div className="mx-auto max-w-7xl space-y-6">
        <LeadershipPageHeader
          eyebrow="Falcon Workspace"
          title="HR Analytics"
          description="Faculty retention, faculty-to-student ratio, and monthly payroll exposure."
        />

        <div className="grid gap-4 md:grid-cols-3">
          {kpis.map((item) => (
            <Card key={item.label}>
              <CardHeader>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-3xl font-black text-sgvu-navy">{item.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
