'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HrStatCard } from '@/components/hr/HrStatCard';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useAuthedApi } from '@/lib/api';
import { useDeanDepartments } from '@/hooks/useDeanDepartments';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';

type PlacementPayload = {
  eligible_students: number;
  placed_students: number;
  placement_pct: number;
  average_package: number;
  highest_package: number;
  companies_visited: number;
  by_department: Array<{ department: string; placement_pct: number }>;
  offer_trends: Array<{ department: string; offers: number }>;
};

export default function DeanPlacementPage() {
  const api = useAuthedApi();
  const { departments } = useDeanDepartments();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [data, setData] = useState<PlacementPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<PlacementPayload>(
          `/api/academics/dean/intelligence/placement${buildDeanFilterQuery(filters)}`,
        );
        setData(payload);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, filters]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Placement Dashboard"
        description="School-wide placement performance, packages, and department trends."
        workspaceLabel="Dean Workspace"
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Placement data unavailable.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <HrStatCard label="Eligible Students" value={data.eligible_students} />
            <HrStatCard label="Placed Students" value={data.placed_students} />
            <HrStatCard label="Placement %" value={`${data.placement_pct}%`} alert={data.placement_pct < 60} />
            <HrStatCard label="Average Package" value={data.average_package ? `₹${data.average_package}L` : '—'} />
            <HrStatCard label="Highest Package" value={data.highest_package ? `₹${data.highest_package}L` : '—'} />
            <HrStatCard label="Companies Visited" value={data.companies_visited} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <HodPanel title="Department Placement %">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_department}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="placement_pct" fill="#1e3a5f" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </HodPanel>

            <HodPanel title="Offer Trends">
              <HodDataTable
                columns={[
                  { key: 'dept', label: 'Department', render: (r) => r.department },
                  { key: 'offers', label: 'Offers', render: (r) => String(r.offers) },
                ]}
                rows={data.offer_trends}
                rowKey={(r) => r.department}
              />
            </HodPanel>
          </div>
        </>
      )}
    </HodPageFrame>
  );
}
