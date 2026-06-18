'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Row = {
  course_code: string;
  course_name: string;
  enrolled: number;
  passed: number;
  failed: number;
  pass_percent: number;
};

export default function DeanResultAnalyticsPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows((await deanApi.resultAnalytics()) as Row[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load result analytics');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [deanApi]);

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Result Analytics"
        description="Pass / fail breakdown across school departments."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.course_code}
        empty="No graded enrollments in school scope."
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
          { key: 'enrolled', label: 'Enrolled', className: 'w-20 tabular-nums', render: (r) => r.enrolled },
          { key: 'passed', label: 'Passed', className: 'w-20 tabular-nums font-semibold', render: (r) => r.passed },
          { key: 'failed', label: 'Failed', className: 'w-20 tabular-nums', render: (r) => r.failed },
          {
            key: 'pass',
            label: 'Pass %',
            className: 'w-20 tabular-nums font-bold',
            render: (r) => `${r.pass_percent}%`,
          },
        ]}
      />
    </HodPageFrame>
  );
}
