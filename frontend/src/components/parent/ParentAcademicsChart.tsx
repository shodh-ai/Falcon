'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Row = {
  course_code: string;
  course_name: string;
  mid_term: string | null;
  mid_max: string | null;
  end_term: string | null;
  end_max: string | null;
};

export function ParentAcademicsChart({ data }: { data: Row[] }) {
  const chartData = data.map((r) => ({
    name: r.course_code,
    mid: r.mid_max ? Math.round((Number(r.mid_term) / Number(r.mid_max)) * 100) : 0,
    end: r.end_max ? Math.round((Number(r.end_term) / Number(r.end_max)) * 100) : 0,
  }));

  if (!chartData.length) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Published marks will appear here once exams are finalized.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v: number) => [`${v}%`, 'Score']} />
          <Legend />
          <Bar dataKey="mid" name="Mid-Term %" fill="#d6b65d" radius={[4, 4, 0, 0]} />
          <Bar dataKey="end" name="End-Term %" fill="#08234a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
