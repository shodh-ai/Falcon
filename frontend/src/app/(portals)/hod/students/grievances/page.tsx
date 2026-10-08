'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowUpRight } from 'lucide-react';

type Row = {
  ticket_id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  student_name: string;
  student_email: string | null;
  description: string;
};

export default function HodGrievancesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Row | null>(null);
  const [message, setMessage] = useState('');
  const [resolving, setResolving] = useState(false);
  const [escalating, setEscalating] = useState(false);

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
    } catch {
      toast.error('Failed to resolve ticket');
    } finally {
      setResolving(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedTicket) return;
    setEscalating(true);
    try {
      await api.post(`/api/helpdesk/tickets/${selectedTicket.ticket_id}/escalate`);
      toast.success('Ticket escalated successfully');
      setRows((prev) =>
        prev.map((r) =>
          r.ticket_id === selectedTicket.ticket_id ? { ...r, status: 'ESCALATED' } : r,
        ),
      );
      setSelectedTicket(null);
      setMessage('');
    } catch {
      toast.error('Failed to escalate ticket');
    } finally {
      setEscalating(false);
    }
  };

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
        onRowClick={(r) => setSelectedTicket(r)}
        columns={[
          {
            key: 'student',
            label: 'Student',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.student_name}</p>
                <p className="text-muted-foreground text-xs">{r.student_email}</p>
              </div>
            ),
          },
          {
            key: 'subject',
            label: 'Subject',
            render: (r) => (
              <div>
                <p className="font-medium text-sm">{r.title}</p>
                <p className="text-muted-foreground text-xs">{r.category}</p>
              </div>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            className: 'w-28',
            render: (r) => (
              <span 
                className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-wider ${
                  r.status === 'PENDING' ? 'bg-red-50 text-red-600 border-red-200' : 
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

      <Sheet open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <SheetContent side="right" className="bg-white text-sgvu-navy border-l border-gray-100 p-6 flex flex-col justify-between h-full w-[min(100vw,28rem)]">
          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            <div className="border-b border-gray-100 pb-4">
              <SheetTitle className="text-xl font-bold text-sgvu-navy">Grievance Details</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">Ticket ID: {selectedTicket?.ticket_id}</p>
            </div>

            {/* Student Details */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student Details</h4>
              <div className="bg-slate-50 rounded-xl p-4 border border-gray-100 space-y-1">
                <p className="font-bold text-sm">{selectedTicket?.student_name}</p>
                <p className="text-xs text-muted-foreground">{selectedTicket?.student_email}</p>
                <p className="text-[11px] text-muted-foreground/80 mt-2">
                  Raised on: {selectedTicket ? new Date(selectedTicket.created_at).toLocaleString('en-IN') : ''}
                </p>
              </div>
            </div>

            {/* Grievance Category & Subject */}
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grievance Topic</h4>
              <p className="text-sm font-semibold">{selectedTicket?.title}</p>
              <p className="text-xs bg-slate-100 border border-slate-200/60 rounded px-2 py-0.5 inline-block text-muted-foreground uppercase font-medium mt-1">{selectedTicket?.category}</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 text-sm text-sgvu-navy leading-relaxed whitespace-pre-wrap">
                {selectedTicket?.description || 'No description provided.'}
              </div>
            </div>

            {/* Resolve Message Textarea */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response Message (Optional)</h4>
              <textarea
                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sgvu-gold focus:border-transparent resize-none bg-slate-50/30"
                rows={3}
                placeholder="Type response to student..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>

          {/* Action Buttons at the bottom */}
          <div className="border-t border-gray-100 pt-4 flex gap-3 bg-white mt-auto">
            <Button
              variant="outline"
              disabled={escalating || resolving || selectedTicket?.status === 'RESOLVED'}
              onClick={handleEscalate}
              className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50/80 rounded-xl h-11 text-sm font-medium transition duration-200"
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              {escalating ? 'Escalating...' : 'Escalate'}
            </Button>
            <Button
              disabled={escalating || resolving || selectedTicket?.status === 'RESOLVED'}
              onClick={handleResolve}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-11 text-sm font-medium transition duration-200 shadow-sm border-0"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {resolving ? 'Resolving...' : 'Resolve'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </HodPageFrame>
  );
}
