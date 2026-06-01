'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = ['#08234a', '#d6b65d', '#10b981', '#0ea5e9', '#8b5cf6', '#f43f5e'];

export function IqacGauge({ label, value, unit, max = 100 }: { label: string; value: number; unit?: string; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black text-sgvu-navy">
        {value}
        {unit && <span className="ml-1 text-lg font-medium text-muted-foreground">{unit}</span>}
      </p>
      <div className="mt-3 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-sgvu-navy transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function IqacBarChart({
  data,
  dataKey,
  nameKey,
}: {
  data: { [key: string]: string | number }[];
  dataKey: string;
  nameKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey={dataKey} fill="#08234a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IqacPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
