'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type TimelineStep = {
  stage: string;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  remarks: string | null;
};

export function DeanApprovalTimeline({
  type,
  id,
}: {
  type: string;
  id: string;
}) {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    current_status: string;
    remarks?: string | null;
    steps: TimelineStep[];
  } | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<{
          current_status: string;
          remarks?: string | null;
          steps: TimelineStep[];
        }>(`/api/academics/dean/intelligence/approval-timeline/${type}/${id}`);
        setData(payload);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, type, id]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…
      </p>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Timeline unavailable.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Current status: <span className="font-semibold text-sgvu-navy">{data.current_status}</span>
      </p>
      <ol className="space-y-3 border-l-2 border-slate-200 pl-4" aria-label="Approval workflow timeline">
        {data.steps.map((step) => (
          <li key={step.stage} className="relative">
            <span
              className={cn(
                'absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border-2 border-white',
                step.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-300',
              )}
            />
            <p className="font-medium text-sgvu-navy">{step.stage}</p>
            <p className="text-xs text-muted-foreground">
              {step.approved_at
                ? new Date(step.approved_at).toLocaleString('en-IN')
                : step.status === 'completed'
                  ? 'Completed'
                  : 'Pending'}
            </p>
            {step.remarks ? (
              <p className="text-xs text-muted-foreground">Remarks: {step.remarks}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
