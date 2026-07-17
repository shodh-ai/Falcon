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
import { useAuthedApi } from '@/lib/api';
import { useDeanDepartments } from '@/hooks/useDeanDepartments';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';
import { toast } from '@/lib/notifications/falcon-toast';

type BudgetPayload = {
  allocated_budget: number;
  spent_budget: number;
  remaining_budget: number;
  utilization_pct: number;
  department_wise: Array<{
    dept_name: string;
    allocated: number;
    spent: number;
    remaining: number;
    utilization_pct: number;
  }>;
  research_budget: { allocated: number; spent: number };
  lab_budget: { allocated: number; spent: number };
  infrastructure_budget: { allocated: number; spent: number };
  alerts: Array<{ priority: string; message: string }>;
};

export default function DeanBudgetPage() {
  const api = useAuthedApi();
  const { departments } = useDeanDepartments();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [data, setData] = useState<BudgetPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<BudgetPayload>(
          `/api/academics/dean/intelligence/budget${buildDeanFilterQuery(filters)}`,
        );
        setData(payload);
      } catch {
        setData(null);
        toast.error('Failed to load budget overview');
      } finally {
        setLoading(false);
      }
    })();
  }, [api, filters]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Budget Monitoring"
        description="School budget allocation, utilization, and threshold alerts."
        workspaceLabel="Dean Workspace"
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Budget data unavailable.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HrStatCard label="Allocated Budget" value={`₹${data.allocated_budget.toLocaleString('en-IN')}`} />
            <HrStatCard label="Spent Budget" value={`₹${data.spent_budget.toLocaleString('en-IN')}`} />
            <HrStatCard label="Remaining Budget" value={`₹${data.remaining_budget.toLocaleString('en-IN')}`} />
            <HrStatCard
              label="Utilization"
              value={`${data.utilization_pct}%`}
              alert={data.utilization_pct > 90}
            />
          </div>

          {data.alerts.length > 0 ? (
            <HodPanel title="Budget Alerts">
              <ul className="space-y-2 text-sm">
                {data.alerts.map((alert, index) => (
                  <li key={index} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    {alert.message}
                  </li>
                ))}
              </ul>
            </HodPanel>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <HrStatCard label="Research Budget" value={`₹${data.research_budget.spent.toLocaleString('en-IN')}`} sub={`Allocated ₹${data.research_budget.allocated.toLocaleString('en-IN')}`} />
            <HrStatCard label="Lab Budget" value={`₹${data.lab_budget.spent.toLocaleString('en-IN')}`} sub={`Allocated ₹${data.lab_budget.allocated.toLocaleString('en-IN')}`} />
            <HrStatCard label="Infrastructure Budget" value={`₹${data.infrastructure_budget.spent.toLocaleString('en-IN')}`} sub={`Allocated ₹${data.infrastructure_budget.allocated.toLocaleString('en-IN')}`} />
          </div>

          <HodPanel title="Department-wise Budget">
            <HodDataTable
              columns={[
                { key: 'dept', label: 'Department', render: (r) => String(r.dept_name) },
                { key: 'alloc', label: 'Allocated', render: (r) => `₹${Number(r.allocated).toLocaleString('en-IN')}` },
                { key: 'spent', label: 'Spent', render: (r) => `₹${Number(r.spent).toLocaleString('en-IN')}` },
                { key: 'util', label: 'Utilization', render: (r) => `${r.utilization_pct}%` },
              ]}
              rows={data.department_wise}
              rowKey={(r) => String(r.dept_name)}
            />
          </HodPanel>
        </>
      )}
    </HodPageFrame>
  );
}
