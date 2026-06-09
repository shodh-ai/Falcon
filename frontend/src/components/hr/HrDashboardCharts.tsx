'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

type PiePoint = { name: string; value: number; pct: number; color: string };
type AttritionPoint = { month: string; turnover_pct: number; exits: number };

export function HrAttendanceDonutChart({ data, presentPct }: { data: PiePoint[]; presentPct: number }) {
  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-black text-sgvu-navy">{presentPct}%</p>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Present</p>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={3}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(8,35,74,0.08)',
            }}
            formatter={(v: number, name: string, props: { payload?: { pct?: number } }) => [
              `${v} staff · ${props.payload?.pct ?? 0}%`,
              name,
            ]}
          />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HrAttritionLineChart({ data }: { data: AttritionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis unit="%" tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => [`${v}%`, 'Turnover']} />
        <Line type="monotone" dataKey="turnover_pct" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
