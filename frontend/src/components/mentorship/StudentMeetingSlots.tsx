'use client';

import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StudentMeeting = {
  meeting_id: string;
  requested_time: string;
  topic: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  proctor_remarks: string | null;
};

function statusStyles(status: StudentMeeting['status']) {
  switch (status) {
    case 'APPROVED':
      return 'border-emerald-300 bg-emerald-50';
    case 'REJECTED':
      return 'border-red-300 bg-red-50';
    default:
      return 'border-amber-300 bg-amber-50';
  }
}

function statusBadge(status: StudentMeeting['status']) {
  switch (status) {
    case 'APPROVED':
      return <Badge className="bg-emerald-600">Approved</Badge>;
    case 'REJECTED':
      return <Badge variant="destructive">Declined</Badge>;
    case 'COMPLETED':
      return <Badge variant="secondary">Completed</Badge>;
    default:
      return <Badge variant="warning">Pending</Badge>;
  }
}

export function StudentMeetingSlots({ meetings }: { meetings: StudentMeeting[] }) {
  if (!meetings.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your meeting requests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Book a slot above — your mentor will approve or suggest another time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your meeting requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {meetings.map((m) => (
          <div
            key={m.meeting_id}
            className={cn('rounded-xl border p-4', statusStyles(m.status))}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1 font-medium text-sgvu-navy">
                  <CalendarClock className="h-4 w-4" />
                  {new Date(m.requested_time).toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{m.topic ?? 'Mentorship meeting'}</p>
                {m.status === 'APPROVED' && m.proctor_remarks && (
                  <p className="mt-2 text-sm font-medium text-emerald-800">
                    <span className="font-normal text-muted-foreground">Mentor: </span>
                    {m.proctor_remarks}
                  </p>
                )}
                {m.status === 'REJECTED' && m.proctor_remarks && (
                  <p className="mt-2 text-sm text-red-800">
                    <span className="font-normal text-muted-foreground">Mentor: </span>
                    {m.proctor_remarks}
                  </p>
                )}
              </div>
              {statusBadge(m.status)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
