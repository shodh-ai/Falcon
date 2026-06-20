'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Row = {
  proxy_id: string;
  date_of_proxy: string;
  course_code: string;
  course_name: string;
  absent_faculty_name: string;
  proxy_faculty_name: string;
  start_time: string;
  end_time: string;
};

export default function HodProxyApprovalsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Row[]>('/api/academics/hod/approvals/proxy-requests')
      .then(setRows)
      .finally(() => setLoading(false));
  }, [api]);

  async function act(proxyId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await api.patch(`/api/academics/hod/approvals/proxy-requests/${proxyId}`, { action });
      toast.success(action === 'APPROVE' ? 'Proxy approved — alternate faculty can mark attendance' : 'Rejected');
      setRows(await api.get('/api/academics/hod/approvals/proxy-requests'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader title="Proxy / Alternate Teaching" description="Approve substitute faculty for leave days." />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.proxy_id}
        empty="No pending proxy requests."
        columns={[
          { key: 'course', label: 'Course', render: (r) => `${r.course_code} — ${r.course_name}` },
          { key: 'date', label: 'Date', render: (r) => r.date_of_proxy },
          { key: 'absent', label: 'Absent faculty', render: (r) => r.absent_faculty_name },
          { key: 'proxy', label: 'Proxy faculty', render: (r) => r.proxy_faculty_name },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void act(r.proxy_id, 'APPROVE')}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => void act(r.proxy_id, 'REJECT')}>Reject</Button>
              </div>
            ),
          },
        ]}
      />
    </HodPageFrame>
  );
}
