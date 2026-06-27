'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Row = {
  ticket_id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  student_name: string;
  student_email: string | null;
};

export default function DeanGrievancesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Row | null>(null);
  const [message, setMessage] = useState('');
  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => {
    if (!selectedTicket) return;
    setResolving(true);
    try {
      if (message.trim()) {
        await api.post(`/api/helpdesk/tickets/${selectedTicket.ticket_id}/messages`, { message });
      }
      await api.patch(`/api/helpdesk/tickets/${selectedTicket.ticket_id}/status`, { status: 'RESOLVED' });
      toast.success('Ticket resolved successfully');
      setRows(rows.map(r => r.ticket_id === selectedTicket.ticket_id ? { ...r, status: 'RESOLVED' } : r));
      setSelectedTicket(null);
      setMessage('');
    } catch (e) {
      toast.error('Failed to resolve ticket');
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/dean/grievances');
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
        description="Academic helpdesk tickets escalated to Dean."
        workspaceLabel="Dean Workspace"
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
              <span 
                onClick={() => r.status === 'PENDING' ? setSelectedTicket(r) : undefined}
                className={`rounded-md border px-2 py-1 text-xs font-medium uppercase ${
                  r.status === 'PENDING' ? 'bg-red-50 text-red-600 border-red-200 cursor-pointer hover:bg-red-100' : 
                  r.status === 'RESOLVED' ? 'bg-green-50 text-green-600 border-green-200' :
                  'bg-slate-50 border-gray-200'
                }`}
              >
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
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Ticket</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <textarea 
              className="w-full border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              rows={4}
              placeholder="Optional message to student..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTicket(null)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={resolving}>{resolving ? 'Resolving...' : 'Resolve'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HodPageFrame>
  );
}
