'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type Criterion = {
  key: string;
  label: string;
  weight: number;
  description: string;
};

type Row = {
  appraisal_record_id: string;
  appraisal_year: number;
  auto_api_score: number | null;
  hod_rating: number | null;
  hr_final_status: string;
  name: string;
  email: string | null;
};

type AppraisalResponse = {
  appraisal_year: number;
  criteria: Criterion[];
  items: Row[];
};

function statusLabel(status: string) {
  if (status === 'HOD_REVIEW' || status === 'PENDING') return 'Pending HOD review';
  if (status === 'HR_APPROVED') return 'Submitted to HR';
  return status.replace(/_/g, ' ');
}

export default function DeanAppraisalsPage() {
  const api = useAuthedApi();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [appraisalYear, setAppraisalYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<AppraisalResponse>('/api/academics/dean/appraisals');
        setCriteria(data.criteria ?? []);
        setRows(data.items ?? []);
        setAppraisalYear(data.appraisal_year ?? new Date().getFullYear());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load appraisals');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.hr_final_status === 'HOD_REVIEW' || r.hr_final_status === 'PENDING').length,
    [rows],
  );

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Appraisals & API Scores"
        description="School-wide faculty appraisal progress across all departments under your school."
        workspaceLabel="Dean Workspace"
        meta={
          <span>
            {appraisalYear} cycle · {pendingCount} pending HOD review · {rows.length} faculty
          </span>
        }
      />

      {!loading && criteria.length > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {criteria.map((c) => (
            <div key={c.key} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-sgvu-navy">
                {c.label}{' '}
                <span className="font-normal text-muted-foreground">({Math.round(c.weight * 100)}%)</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading school appraisals…
        </div>
      ) : (
        <HodDataTable
          rows={rows}
          rowKey={(r) => r.appraisal_record_id}
          empty="No faculty appraisals in your school scope."
          columns={[
            {
              key: 'name',
              label: 'Faculty',
              render: (r) => (
                <div>
                  <p className="font-semibold">{r.name}</p>
                  {r.email ? <p className="text-xs text-muted-foreground">{r.email}</p> : null}
                </div>
              ),
            },
            {
              key: 'api',
              label: 'Auto API',
              render: (r) => (r.auto_api_score != null ? r.auto_api_score.toFixed(2) : '—'),
            },
            {
              key: 'hod',
              label: 'HOD Rating',
              render: (r) => (r.hod_rating != null ? r.hod_rating.toFixed(2) : '—'),
            },
            {
              key: 'status',
              label: 'Status',
              render: (r) => statusLabel(r.hr_final_status),
            },
          ]}
        />
      )}
    </HodPageFrame>
  );
}
