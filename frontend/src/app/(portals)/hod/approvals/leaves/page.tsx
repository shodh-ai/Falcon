'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';

type LeaveRow = {
  leave_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  staff: { name: string; email: string | null };
};

export default function HodLeaveApprovalsPage() {
  const api = useAuthedApi();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [acting, setActing] = useState(false);

  const { data: rows = [], isLoading, mutate } = useSWR<LeaveRow[]>(
    'hod-leave-approvals',
    () => api.get<LeaveRow[]>('/api/academics/hod/approvals/leaves'),
    { revalidateOnFocus: true },
  );

  async function approve(leaveId: string) {
    const previous = rows;
    await mutate(
      rows.filter((r) => r.leave_id !== leaveId),
      { revalidate: false },
    );
    try {
      await api.patch(`/api/hr/leaves/${leaveId}/approve`, {});
      toast.success('Leave approved');
      void mutate();
    } catch (e) {
      await mutate(previous, { revalidate: false });
      toast.error(e instanceof Error ? e.message : 'Approval failed');
    }
  }

  async function reject() {
    if (!rejectId || remarks.trim().length < 3) {
      toast.error('Enter a reason for rejection (3+ characters)');
      return;
    }
    const previous = rows;
    const rejectingId = rejectId;
    setActing(true);
    await mutate(
      rows.filter((r) => r.leave_id !== rejectingId),
      { revalidate: false },
    );
    try {
      await api.patch(`/api/hr/leaves/${rejectingId}/reject`, { remarks: remarks.trim() });
      toast.success('Leave rejected');
      setRejectId(null);
      setRemarks('');
      void mutate();
    } catch (e) {
      await mutate(previous, { revalidate: false });
      toast.error(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Faculty Leave Approvals</h2>
        <p className="text-sm text-muted-foreground">Dedicated CL/SL/EL inbox for HOD review.</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending leave requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending leave requests.</p>
          )}
          {!isLoading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Faculty</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">From</th>
                    <th className="py-2 pr-4">To</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.leave_id} className="border-b">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.staff?.name}</p>
                        <p className="text-xs text-muted-foreground">{row.staff?.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{row.leave_type}</Badge>
                      </td>
                      <td className="py-3 pr-4">{row.start_date}</td>
                      <td className="py-3 pr-4">{row.end_date}</td>
                      <td className="py-3 pr-4 max-w-xs">{row.reason ?? '—'}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            disabled={acting}
                            onClick={() => void approve(row.leave_id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={acting}
                            onClick={() => {
                              setRejectId(row.leave_id);
                              setRemarks('');
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(rejectId)} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[100px] w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Reason for rejection (shown to faculty member)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)} disabled={acting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void reject()} disabled={acting}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
