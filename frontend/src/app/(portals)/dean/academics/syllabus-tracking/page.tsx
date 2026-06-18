'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Row = {
  course_code: string;
  course_name: string;
  faculty_name: string;
  completed_modules: number;
  total_modules: number;
  coverage_percent: number;
  behind_schedule: boolean;
};

export default function DeanSyllabusTrackingPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows((await deanApi.syllabusCoverage()) as Row[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load syllabus data');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [deanApi]);

  const behind = rows.filter((r) => r.behind_schedule).length;

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Syllabus Tracking"
        description="School-wide LMS module completion and syllabus risk."
        meta={<span>{behind} courses behind schedule</span>}
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => `${r.course_code}-${r.faculty_name}`}
        empty="No LMS modules in school scope."
        columns={[
          {
            key: 'course',
            label: 'Course',
            render: (r) => (
              <div>
                <p className={cn('font-semibold', r.behind_schedule && 'text-sgvu-gold')}>{r.course_code}</p>
                <p className="text-muted-foreground">{r.faculty_name}</p>
              </div>
            ),
          },
          {
            key: 'modules',
            label: 'Modules',
            className: 'w-24',
            render: (r) => `${r.completed_modules}/${r.total_modules}`,
          },
          {
            key: 'pct',
            label: 'Coverage',
            className: 'w-20 tabular-nums font-bold',
            render: (r) => `${r.coverage_percent}%`,
          },
        ]}
      />
    </HodPageFrame>
  );
}
