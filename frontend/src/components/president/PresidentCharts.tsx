'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EXECUTIVE_CHART_COLORS,
  EXECUTIVE_CHART_TOOLTIP,
} from '@/components/leadership/executive/design-tokens';
import { cn } from '@/lib/utils';
import type { AdmissionsTrendPoint, DepartmentPlacementRow, FacultyShortageRow, PayrollBurnPoint } from './types';

const NAVY = EXECUTIVE_CHART_COLORS.navy;
const GOLD = EXECUTIVE_CHART_COLORS.gold;
const BRIGHT_GOLD = '#D4AF37';
const GREEN = EXECUTIVE_CHART_COLORS.green;

type AdmissionsYearKey = 'lastYear' | 'thisYear';

const YEAR_OPTIONS: Array<{
  key: AdmissionsYearKey;
  label: string;
  color: string;
}> = [
  { key: 'lastYear', label: 'AY 2024-25', color: NAVY },
  { key: 'thisYear', label: 'AY 2025-26', color: BRIGHT_GOLD },
];

export function AdmissionsYearToggle({
  value,
  onChange,
}: {
  value: AdmissionsYearKey;
  onChange: (year: AdmissionsYearKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Select academic year"
      className="flex flex-wrap items-center justify-end gap-2"
    >
      {YEAR_OPTIONS.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold focus-visible:ring-offset-2',
              active
                ? 'border-current bg-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-sgvu-navy/20 hover:text-sgvu-navy',
            )}
            style={active ? { color: option.color, borderColor: option.color } : undefined}
          >
            <span className="inline-flex items-center gap-1.5" aria-hidden="true">
              <span className="h-[2px] w-4 rounded-full" style={{ backgroundColor: option.color }} />
              <span
                className="h-2.5 w-2.5 rounded-full border-2 bg-white"
                style={{ borderColor: option.color }}
              />
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function AdmissionsAreaChart({
  data,
  selectedYear = 'thisYear',
}: {
  data: AdmissionsTrendPoint[];
  selectedYear?: AdmissionsYearKey;
}) {
  const activeOption = YEAR_OPTIONS.find((option) => option.key === selectedYear) ?? YEAR_OPTIONS[1];

  const chartData = useMemo(
    () =>
      data.map((point) => ({
        month: point.month,
        applications: point[selectedYear],
      })),
    [data, selectedYear],
  );

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} accessibilityLayer>
          <defs>
            <linearGradient id="fillSelectedYear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={activeOption.color} stopOpacity={0.28} />
              <stop offset="95%" stopColor={activeOption.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fill: NAVY, fontSize: 11 }} />
          <YAxis tick={{ fill: NAVY, fontSize: 11 }} />
          <Tooltip
            contentStyle={EXECUTIVE_CHART_TOOLTIP}
            formatter={(value: number) => [value.toLocaleString('en-IN'), activeOption.label]}
          />
          <Area
            type="monotone"
            dataKey="applications"
            name={activeOption.label}
            stroke={activeOption.color}
            fill="url(#fillSelectedYear)"
            strokeWidth={3}
            activeDot={{ fill: activeOption.color, stroke: '#ffffff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-center text-xs text-muted-foreground">
        Showing monthly admissions for <span className="font-semibold text-sgvu-navy">{activeOption.label}</span>
      </p>
    </div>
  );
}

export function AlumniDonationTrendChart({
  data,
}: {
  data: Array<{ month: string; donations: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="fillAlumniDonations" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="95%" stopColor={GOLD} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fill: '#475569', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => `₹${value}L`}
        />
        <Tooltip
          contentStyle={EXECUTIVE_CHART_TOOLTIP}
          formatter={(value: number) => [`₹${value} L`, 'Donations']}
        />
        <Area
          type="monotone"
          dataKey="donations"
          name="Monthly Donations"
          stroke={NAVY}
          fill="url(#fillAlumniDonations)"
          strokeWidth={3}
          activeDot={{ fill: GOLD, stroke: '#ffffff', strokeWidth: 2, r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DepartmentPlacementBarChart({ data }: { data: DepartmentPlacementRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: NAVY, fontSize: 11 }} unit="%" />
        <YAxis
          type="category"
          dataKey="department"
          width={180}
          tick={{ fontSize: 12, fill: '#475569' }}
          tickFormatter={(value: string) =>
            value.length > 22 ? `${value.substring(0, 22)}...` : value
          }
        />
        <Tooltip
          contentStyle={EXECUTIVE_CHART_TOOLTIP}
          formatter={(value: number) => [`${value}%`, 'Placement Rate']}
        />
        <Bar dataKey="placementPct" name="Placement %" fill={NAVY} radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const RED = '#dc2626';

export function FacultyShortageBarChart({ data }: { data: FacultyShortageRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="department"
          tick={{ fill: NAVY, fontSize: 10 }}
          interval={0}
          angle={-18}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={{ fill: NAVY, fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={EXECUTIVE_CHART_TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sanctioned" name="Sanctioned Posts" fill={NAVY} radius={[4, 4, 0, 0]} barSize={14} />
        <Bar dataKey="filled" name="Filled Posts" fill={GREEN} radius={[4, 4, 0, 0]} barSize={14} />
        <Bar dataKey="shortage" name="Shortage" fill={RED} radius={[4, 4, 0, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PayrollBurnAreaChart({ data }: { data: PayrollBurnPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} accessibilityLayer>
        <defs>
          <linearGradient id="fillPayrollBurn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={NAVY} stopOpacity={0.28} />
            <stop offset="95%" stopColor={NAVY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fill: NAVY, fontSize: 11 }} />
        <YAxis
          tick={{ fill: NAVY, fontSize: 11 }}
          tickFormatter={(v: number) => `₹${v} Cr`}
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={EXECUTIVE_CHART_TOOLTIP}
          formatter={(value: number) => [`₹${value.toFixed(2)} Cr`, 'Monthly Payroll']}
        />
        <Area
          type="monotone"
          dataKey="payrollCr"
          name="Monthly Payroll"
          stroke={NAVY}
          fill="url(#fillPayrollBurn)"
          strokeWidth={2.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
