'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';

type Row = {
  course_code: string;
  course_name: string;
  faculty_name: string;
  completed_modules: number;
  total_modules: number;
  coverage_percent: number;
  behind_schedule: boolean;
  days_behind?: number;
};

export default function HodSyllabusTrackingPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/hod/syllabus-coverage');
        setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load syllabus data');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const behind = rows.filter((r) => r.behind_schedule).length;

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Syllabus & Lesson Tracking"
        description="LMS module completion by course and faculty."
        meta={
          <span>
            <span className="font-semibold text-sgvu-navy">{behind}</span> course{behind === 1 ? '' : 's'} behind
            schedule
          </span>
        }
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => `${r.course_code}-${r.faculty_name}`}
        empty="No course modules uploaded yet."
        columns={[
          {
            key: 'course',
            label: 'Course',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.course_code}</p>
                <p className="text-muted-foreground">{r.course_name}</p>
              </div>
            ),
          },
          { key: 'faculty', label: 'Faculty', render: (r) => r.faculty_name },
          {
            key: 'modules',
            label: 'Modules',
            className: 'w-20 tabular-nums',
            render: (r) => `${r.completed_modules}/${r.total_modules}`,
          },
          {
            key: 'coverage',
            label: 'Coverage',
            className: 'w-36',
            render: (r) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={cn('h-full rounded-full', r.behind_schedule ? 'bg-sgvu-navy/40' : 'bg-sgvu-gold')}
                      style={{ width: `${r.coverage_percent}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums">{r.coverage_percent}%</span>
                </div>
                {r.behind_schedule ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Behind schedule{r.days_behind ? ` · ${r.days_behind} days behind plan` : ''}
                  </p>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </HodPageFrame>
  );
}
