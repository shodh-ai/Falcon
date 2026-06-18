'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodPageFrame, HodPageHeader, HodTableHead, HodTableWrap } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';
import { cn } from '@/lib/utils';

type Row = {
  appraisal_record_id: string;
  appraisal_year: number;
  auto_api_score: number | null;
  hod_rating: number | null;
  hr_final_status: string | null;
  user_id: string;
  name: string;
  email: string;
};

export default function DeanAppraisalsPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows((await deanApi.appraisals()) as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load appraisals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [deanApi]);

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Appraisals & API Scores"
        description="Review faculty appraisal summaries submitted by HODs across the school."
        meta={<span>{rows.length} record{rows.length === 1 ? '' : 's'} in school scope</span>}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          No appraisal records in school scope.
        </p>
      ) : (
        <HodTableWrap>
          <table className="w-full text-sm">
            <HodTableHead columns={['Faculty', 'Year', 'Auto API', 'HOD Rating', 'HR Status']} />
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.appraisal_record_id}
                  className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sgvu-navy">{row.name}</p>
                    <p className="text-muted-foreground">{row.email}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.appraisal_year}</td>
                  <td className="px-4 py-3 tabular-nums">{row.auto_api_score ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{row.hod_rating ?? '—'}</td>
                  <td className="px-4 py-3">{row.hr_final_status ?? 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </HodTableWrap>
      )}
    </HodPageFrame>
  );
}
