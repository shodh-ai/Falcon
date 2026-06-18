'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Row = {
  user_id: string;
  name: string;
  email: string;
  department?: string | null;
  average_attendance?: number;
  course_count?: number;
  cgpa?: number | null;
};

export default function DeanStudentMonitorPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows((await deanApi.students()) as Row[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load students');
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
        title="Student Monitor"
        description="School-wide student roster with academic risk indicators."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.user_id}
        empty="No students in school scope."
        columns={[
          {
            key: 'name',
            label: 'Student',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-muted-foreground">{r.email}</p>
              </div>
            ),
          },
          { key: 'dept', label: 'Department', render: (r) => r.department ?? '—' },
          {
            key: 'attendance',
            label: 'Avg Attendance',
            className: 'w-28 tabular-nums',
            render: (r) => (r.average_attendance != null ? `${r.average_attendance}%` : '—'),
          },
          {
            key: 'cgpa',
            label: 'CGPA',
            className: 'w-20 tabular-nums',
            render: (r) => r.cgpa ?? '—',
          },
        ]}
      />
    </HodPageFrame>
  );
}
