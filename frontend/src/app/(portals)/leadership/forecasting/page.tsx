'use client';

import { useEffect, useState } from 'react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { TrafficLightKpi } from '@/components/leadership/executive';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipForecastingPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.predictiveForecast().then(setData).catch(() => setData(null));
  }, [api]);

  const intake = (data?.intake_analysis as Record<string, unknown>) ?? {};
  const resource = (data?.resource_forecasting as Record<string, unknown>) ?? {};
  const admit500 = (resource.if_admit_500_more as Record<string, unknown>) ?? {};
  const programs = (intake.program_forecasts as Array<Record<string, unknown>>) ?? [];

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Forecasting & Strategy"
        title="Predictive Intake & Resource Planning"
        description="Marketing leads needed and faculty/hostel capacity if intake grows"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TrafficLightKpi label="Avg Conversion Rate" value={`${intake.avg_conversion_rate_pct ?? '—'}%`} status="green" />
        <TrafficLightKpi label="Faculty:Student Ratio" value={String(resource.current_faculty_student_ratio ?? '—')} status="yellow" />
        <TrafficLightKpi
          label="Faculty Needed (+500 students)"
          value={String(admit500.additional_faculty_needed ?? '—')}
          status={Number(admit500.additional_faculty_needed ?? 0) > 0 ? 'yellow' : 'green'}
        />
      </div>

      <LeadershipSectionCard title="Program Intake Forecast">
        <ul className="space-y-2 text-sm">
          {programs.map((p) => (
            <li key={String(p.program)} className="flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="font-medium">{String(p.program)}</span>
              <span className="text-muted-foreground">
                {String(p.seats_open)} seats open · ~{String(p.marketing_leads_needed)} leads needed
              </span>
            </li>
          ))}
        </ul>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Resource Forecast (+500 Admissions)">
        <ul className="space-y-2 text-sm">
          <li>Additional faculty required: {String(admit500.additional_faculty_needed ?? '—')}</li>
          <li>Hostel beds available: {String(admit500.hostel_beds_available ?? '—')}</li>
          <li>Hostel capacity sufficient: {admit500.hostel_sufficient ? 'Yes' : 'No — expansion needed'}</li>
        </ul>
      </LeadershipSectionCard>
    </div>
  );
}
