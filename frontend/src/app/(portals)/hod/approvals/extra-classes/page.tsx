'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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

type AdjustmentRow = {
  adjustment_id: string;
  adjustment_type: string;
  original_date: string | null;
  new_date: string | null;
  reason: string | null;
  course_code: string;
  course_name: string;
  faculty_name: string;
  faculty_email: string | null;
};

export default function HodExtraClassApprovalsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<AdjustmentRow[]>('/api/academics/hod/approvals/extra-classes');
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load extra class inbox');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function act(adjustmentId: string, action: 'APPROVE' | 'REJECT', comment?: string) {
    setActing(true);
    try {
      await api.patch(`/api/academics/hod/approvals/extra-classes/${adjustmentId}`, {
        action,
        remarks: comment,
      });
      toast.success(action === 'APPROVE' ? 'Extra class approved' : 'Extra class rejected');
      setRejectId(null);
      setRemarks('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Extra Class Approvals</h2>
        <p className="text-sm text-muted-foreground">
          Review faculty extra-class and timetable adjustment requests for your department.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending extra classes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending extra class requests.</p>
          )}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Faculty</th>
                    <th className="py-2 pr-4">Course</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Schedule</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.adjustment_id} className="border-b">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.faculty_name}</p>
                        <p className="text-xs text-muted-foreground">{row.faculty_email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {row.course_code} — {row.course_name}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{row.adjustment_type.replace('_', ' ')}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {row.original_date ? new Date(row.original_date).toLocaleString() : '—'}
                        {row.new_date && (
                          <span className="block text-xs text-muted-foreground">
                            → {new Date(row.new_date).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 max-w-xs">{row.reason ?? '—'}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            disabled={acting}
                            onClick={() => void act(row.adjustment_id, 'APPROVE')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={acting}
                            onClick={() => {
                              setRejectId(row.adjustment_id);
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
            <DialogTitle>Reject extra class request</DialogTitle>
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
            <Button
              variant="destructive"
              disabled={acting}
              onClick={() => {
                if (!rejectId || remarks.trim().length < 3) {
                  toast.error('Enter a reason for rejection (3+ characters)');
                  return;
                }
                void act(rejectId, 'REJECT', remarks.trim());
              }}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
