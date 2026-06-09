'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type Row = {
  ticket_id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  student_name: string;
  student_email: string | null;
};

export default function HodGrievancesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/hod/grievances');
        setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load grievances');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Grievance Escalations"
        description="Academic helpdesk tickets escalated to HOD."
        meta={<span>{rows.length} open ticket{rows.length === 1 ? '' : 's'}</span>}
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.ticket_id}
        empty="No open academic grievances."
        columns={[
          {
            key: 'student',
            label: 'Student',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.student_name}</p>
                <p className="text-muted-foreground">{r.student_email}</p>
              </div>
            ),
          },
          {
            key: 'subject',
            label: 'Subject',
            render: (r) => (
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-muted-foreground">{r.category}</p>
              </div>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            className: 'w-28',
            render: (r) => (
              <span className="rounded-md border border-gray-200 bg-slate-50 px-2 py-1 text-xs font-medium uppercase">
                {r.status}
              </span>
            ),
          },
          {
            key: 'date',
            label: 'Raised',
            className: 'w-24 whitespace-nowrap tabular-nums',
            render: (r) => new Date(r.created_at).toLocaleDateString('en-IN'),
          },
        ]}
      />
    </HodPageFrame>
  );
}
