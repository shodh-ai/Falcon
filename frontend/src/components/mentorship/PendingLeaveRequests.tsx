'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { isFacultyDemoSmokeId } from '@/lib/faculty-demo-mode';

export type PendingLeaveRequest = {
  interaction_id: string;
  student_name: string | null;
  reason: string;
  start_date: string;
  end_date: string;
  status: string;
};

type Props = {
  requests: PendingLeaveRequest[];
  onUpdated: () => void;
};

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN');
}

export function PendingLeaveRequests({ requests, onUpdated }: Props) {
  const api = useAuthedApi();
  const [remarks, setRemarks] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function respond(interactionId: string, status: 'APPROVED' | 'REJECTED') {
    if (status === 'REJECTED' && remarks.trim().length < 3) {
      toast.error('Please enter a short reason for the mentee');
      return;
    }
    setSubmitting(true);
    try {
      if (isFacultyDemoSmokeId(interactionId)) {
        toast.success(status === 'APPROVED' ? 'Leave request approved (demo)' : 'Leave request declined (demo)');
        setActiveId(null);
        setRemarks('');
        onUpdated();
        return;
      }
      await api.post(`/api/academics/proctor/leave-requests/${interactionId}/respond`, {
        status,
        remarks: remarks.trim() || undefined,
      });
      toast.success(status === 'APPROVED' ? 'Leave request approved' : 'Leave request declined');
      setActiveId(null);
      setRemarks('');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pending leave / permission requests</CardTitle>
        <Badge variant={requests.length ? 'warning' : 'success'}>{requests.length} pending</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.length === 0 && (
          <p className="text-sm text-muted-foreground">No leave requests awaiting your response.</p>
        )}
        {requests.map((req) => (
          <div
            key={req.interaction_id}
            className="flex flex-col gap-3 rounded-xl border border-violet-200/80 bg-violet-50/40 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-medium">{req.student_name ?? 'Mentee'}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(req.start_date)} – {formatDate(req.end_date)}
              </p>
              <p className="mt-1 text-sm">{req.reason}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {activeId === req.interaction_id && (
                <Input
                  placeholder="Remarks (required if declining)"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="sm:w-48"
                />
              )}
              <Button
                size="sm"
                onClick={() => {
                  setActiveId(null);
                  void respond(req.interaction_id, 'APPROVED');
                }}
                disabled={submitting}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (activeId !== req.interaction_id) {
                    setActiveId(req.interaction_id);
                    setRemarks('');
                    return;
                  }
                  void respond(req.interaction_id, 'REJECTED');
                }}
                disabled={submitting}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
