'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';

export type PendingMeeting = {
  meeting_id: string;
  student_name: string | null;
  requested_time: string;
  topic: string | null;
  status: string;
};

type Props = {
  meetings: PendingMeeting[];
  onUpdated: () => void;
};

export function PendingMeetingRequests({ meetings, onUpdated }: Props) {
  const api = useAuthedApi();
  const [approveTarget, setApproveTarget] = useState<PendingMeeting | null>(null);
  const [declineTarget, setDeclineTarget] = useState<PendingMeeting | null>(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function respond(status: 'APPROVED' | 'REJECTED') {
    const target = status === 'APPROVED' ? approveTarget : declineTarget;
    if (!target) return;
    if (remarks.trim().length < 3) {
      toast.error(
        status === 'APPROVED'
          ? 'Please enter the meeting link or room number'
          : 'Please enter a short reason for the mentee',
      );
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/academics/proctor/meetings/${target.meeting_id}/respond`, {
        status,
        remarks: remarks.trim() || undefined,
      });
      toast.success(status === 'APPROVED' ? 'Meeting approved' : 'Meeting declined');
      setApproveTarget(null);
      setDeclineTarget(null);
      setRemarks('');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update meeting');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pending Meeting Requests</CardTitle>
          <Badge variant={meetings.length ? 'warning' : 'success'}>
            {meetings.length} pending
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {meetings.length === 0 && (
            <p className="text-sm text-muted-foreground">No meeting requests awaiting your response.</p>
          )}
          {meetings.map((meeting) => (
            <div
              key={meeting.meeting_id}
              className="flex flex-col gap-3 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <p className="font-semibold text-sgvu-navy">{meeting.student_name ?? 'Mentee'}</p>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  {new Date(meeting.requested_time).toLocaleString()}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Topic: </span>
                  {meeting.topic ?? 'Mentorship meeting'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setRemarks('');
                    setApproveTarget(meeting);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setRemarks('');
                    setDeclineTarget(meeting);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                  Decline / Reschedule
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(approveTarget)} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve meeting</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Required: add a Google Meet link, Zoom URL, or room (e.g. Cabin 402).
          </p>
          <Input
            placeholder="Meet link or room number"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button disabled={submitting || remarks.trim().length < 3} onClick={() => void respond('APPROVED')}>
              Confirm approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(declineTarget)} onOpenChange={(open) => !open && setDeclineTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline or reschedule</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tell the mentee why this slot cannot work and suggest an alternative if possible.
          </p>
          <Input
            placeholder="e.g. Invigilation duty — please book tomorrow 2 PM"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={submitting} onClick={() => void respond('REJECTED')}>
              Send decline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
