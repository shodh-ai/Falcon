'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Loader2, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { useAuthedApi } from '@/lib/api';
import { concernStatusLabel, concernTypeLabel } from '@/lib/student-safety';
import { cn } from '@/lib/utils';
import { isEmptyArray, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoSafetyNotices } from '@/lib/mock/faculty-portal-demo';

type Notice = {
  concern_id: string;
  concern_type: string;
  status: string;
  accused_notified_at: string | null;
  resolution_summary?: string | null;
  created_at: string;
};

function noticeBody(row: Notice): string {
  if (row.status === 'RESOLVED' || row.status === 'CLOSED') {
    return row.resolution_summary?.trim()
      ? `This matter has been ${row.status.toLowerCase()}. ${row.resolution_summary.trim()}`
      : `This matter has been ${row.status.toLowerCase()} by the Disciplinary Committee.`;
  }
  return 'A confidential concern involving you is under review. The Disciplinary Committee / ICC will contact you through official channels if your statement is required. Do not discuss the case with other students.';
}

function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === 'RESOLVED' || s === 'CLOSED') {
    return 'border-transparent bg-emerald-100 text-emerald-800';
  }
  if (s === 'UNDER_REVIEW' || s === 'ESCALATED') {
    return 'border-transparent bg-amber-100 text-amber-900';
  }
  return 'border-transparent bg-sgvu-navy/10 text-sgvu-navy';
}

export function SafetyNoticesPanel({
  title = 'Safety notices',
  description = 'Official notices when a safety concern involving you is under review or has been closed. Do not contact any student about these matters.',
  embedded = false,
}: {
  title?: string;
  description?: string;
  /** When true, omit page-level title (parent workspace already shows chrome). */
  embedded?: boolean;
}) {
  const api = useAuthedApi();
  const pathname = usePathname();
  const facultySmoke = pathname?.startsWith('/faculty');
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Notice[]>('/api/student-safety/accused/notices');
      const live = Array.isArray(data) ? data : [];
      setRows(
        facultySmoke
          ? withFacultyDemoFallback(live, facultyDemoSafetyNotices() as Notice[], isEmptyArray)
          : live,
      );
    } catch (e) {
      if (facultySmoke) {
        const demo = withFacultyDemoFallback(
          [],
          facultyDemoSafetyNotices() as Notice[],
          isEmptyArray,
        );
        setRows(demo);
        setError(demo.length ? null : e instanceof Error ? e.message : 'Could not load safety notices');
      } else {
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not load safety notices');
      }
    } finally {
      setLoading(false);
    }
  }, [api, facultySmoke]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={cn('space-y-5', !embedded && 'mx-auto max-w-3xl p-4 md:p-6')}>
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-bold text-sgvu-navy">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-sgvu-navy/10 bg-white py-16 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notices…
        </div>
      ) : error ? (
        <StudentEmptyState
          icon={AlertTriangle}
          title="Could not load notices"
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <StudentEmptyState
          icon={Shield}
          title="No safety notices for you"
          description="If the Disciplinary Committee opens a case that involves you, an official notice will appear here. You will not see who filed the report."
          className="bg-white py-16 shadow-sm"
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article
              key={row.concern_id}
              className="rounded-2xl border border-sgvu-navy/10 bg-white p-5 shadow-sm transition hover:border-sgvu-gold/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sgvu-navy">
                      {concernTypeLabel(row.concern_type)}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {noticeBody(row)}
                    </p>
                    {row.accused_notified_at ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Official notice sent{' '}
                        {new Date(row.accused_notified_at).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <Badge className={cn('border', statusTone(row.status))}>
                  {concernStatusLabel(row.status as never)}
                </Badge>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
