'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { HodPageFrame, HodPageHeader, HodTableHead, HodTableWrap } from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Row = {
  appraisal_record_id: string;
  appraisal_year: number;
  auto_api_score: number | null;
  hod_rating: number | null;
  hr_final_status: string;
  user_id: string;
  name: string;
  email: string | null;
};

export default function HodAppraisalsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Row[]>('/api/academics/hod/appraisals');
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load appraisals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function submitRating(row: Row) {
    const raw = draft[row.appraisal_record_id] ?? (row.hod_rating !== null ? String(row.hod_rating) : '');
    const rating = Number(raw);
    if (Number.isNaN(rating) || rating < 0 || rating > 5) {
      toast.error('Enter a manager rating between 0 and 5');
      return;
    }
    setSavingId(row.appraisal_record_id);
    try {
      await api.patch(`/api/academics/hod/appraisals/${row.appraisal_record_id}/rating`, {
        hod_rating: rating,
      });
      toast.success(`Rating submitted for ${row.name}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit rating');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Appraisals & API Scores"
        description="Review faculty API scores and submit your manager rating."
        meta={<span>{rows.length} pending review{rows.length === 1 ? '' : 's'}</span>}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          No appraisals pending HOD review.
        </p>
      ) : (
        <HodTableWrap>
          <table className="w-full text-sm">
            <HodTableHead columns={['Faculty', 'Year', 'Auto API', 'HOD Rating', 'Status', '']} />
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
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      className="w-20 rounded-md border border-gray-200 px-3 py-2 text-sm"
                      placeholder="0–5"
                      value={draft[row.appraisal_record_id] ?? row.hod_rating ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [row.appraisal_record_id]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-gray-200 bg-slate-50 px-2 py-1 text-xs font-medium">
                      {row.hr_final_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="default"
                      className="h-9 bg-sgvu-gold text-sm font-semibold text-sgvu-navy hover:bg-sgvu-gold/90"
                      disabled={savingId === row.appraisal_record_id}
                      onClick={() => void submitRating(row)}
                    >
                      {savingId === row.appraisal_record_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Submit'
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HodTableWrap>
      )}
    </HodPageFrame>
  );
}
