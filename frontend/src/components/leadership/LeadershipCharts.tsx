'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const NAVY = '#08234a';
const GOLD = '#d6b65d';
const CHART_TOOLTIP = {
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(8,35,74,0.08)',
};

export function LeadershipBarChart({
  data,
  xKey,
  bars,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  bars: Array<{ key: string; color: string; name: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fill: NAVY, fontSize: 11 }} />
        <YAxis tick={{ fill: NAVY, fontSize: 11 }} />
        <Tooltip contentStyle={CHART_TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadershipLineChart({
  data,
  xKey,
  lines,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  lines: Array<{ key: string; color: string; name: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fill: NAVY, fontSize: 11 }} />
        <YAxis tick={{ fill: NAVY, fontSize: 11 }} />
        <Tooltip contentStyle={CHART_TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DefaulterHeatmap({ data }: { data: Array<{ department: string; outstanding: number }> }) {
  const max = Math.max(...data.map((d) => d.outstanding), 1);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((row) => {
        const intensity = row.outstanding / max;
        return (
          <div
            key={row.department}
            className="rounded-xl border border-red-100 p-3"
            style={{ background: `rgba(239, 68, 68, ${0.06 + intensity * 0.18})` }}
          >
            <p className="truncate text-xs font-medium text-muted-foreground">{row.department}</p>
            <p className="font-mono text-lg font-bold text-red-600">₹{(row.outstanding / 100000).toFixed(1)}L</p>
          </div>
        );
      })}
    </div>
  );
}

export function PassFailChart({
  data,
}: {
  data: Array<{ school: string; pass_count: number; fail_count: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="school" tick={{ fill: NAVY, fontSize: 10 }} />
        <YAxis tick={{ fill: NAVY, fontSize: 11 }} />
        <Tooltip contentStyle={CHART_TOOLTIP} />
        <Bar dataKey="pass_count" name="Pass" fill={NAVY} stackId="a" />
        <Bar dataKey="fail_count" name="Fail" fill="#ef4444" stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export { NAVY, GOLD };
