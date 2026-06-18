'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Row = {
  ticket_id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  student_user_id: string;
  student_name: string;
  student_email: string;
};

export default function DeanGrievancesPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows((await deanApi.grievances()) as Row[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load grievances');
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
        title="Grievance Escalations"
        description="Unresolved academic grievances across school departments."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.ticket_id}
        empty="No open grievances in school scope."
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
          { key: 'title', label: 'Subject', render: (r) => r.title },
          { key: 'status', label: 'Status', className: 'w-28', render: (r) => r.status },
          {
            key: 'created',
            label: 'Raised',
            className: 'w-32',
            render: (r) => new Date(r.created_at).toLocaleDateString('en-IN'),
          },
        ]}
      />
    </HodPageFrame>
  );
}
