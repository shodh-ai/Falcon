'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Row = {
  ticket_id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  student_user_id: string;
};

export default function FinanceGrievancesPage() {
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
        const data = await api.get<Row[]>('/api/helpdesk/tickets/assigned');
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
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Grievance Escalations</CardTitle>
          <p className="text-sm text-muted-foreground">Finance helpdesk tickets escalated to Accountant.</p>
          <p className="text-sm font-medium">{rows.length} open ticket{rows.length === 1 ? '' : 's'}</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Student / Requester</th>
                  <th className="p-3 font-medium">Subject</th>
                  <th className="p-3 font-medium w-28">Status</th>
                  <th className="p-3 font-medium w-24">Raised</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No open finance grievances.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.ticket_id} className="border-b">
                      <td className="p-3">
                        <p className="font-semibold text-xs text-muted-foreground">{r.student_user_id}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{r.subject}</p>
                        <p className="text-muted-foreground">{r.category}</p>
                      </td>
                      <td className="p-3">
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
                      </td>
                      <td className="p-3 whitespace-nowrap tabular-nums">
                        {new Date(r.created_at).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
