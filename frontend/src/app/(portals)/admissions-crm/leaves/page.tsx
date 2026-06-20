'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  formatWorkforceDateRange,
  leaveStatusLabel,
  leaveTypeLabel,
} from '@/lib/workforce-dates';
import { workforceMyRequestsApi } from '@/lib/workforce-api';

type WorkforceRequest = {
  leave_id: string;
  request_type: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  approver_remarks: string | null;
};

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'HR_APPROVED' || status === 'HOD_APPROVED') return 'default';
  if (status === 'PENDING') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

export default function AdmissionsCrmLeavesPage() {
  const api = useAuthedApi();
  const pathname = usePathname();
  const { user } = useAuth();
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.user_id) return;
    setLoading(true);
    void api
      .get<WorkforceRequest[]>(workforceMyRequestsApi(user, pathname))
      .then((data) => setRequests(data.filter((row) => row.request_type === 'LEAVE')))
      .finally(() => setLoading(false));
  }, [api, pathname, user?.user_id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-sgvu-navy">My leave requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track leave you submit from Quick Actions. Approved leave appears here and in the banner above.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request history</CardTitle>
          <CardDescription>Statuses update after your reporting manager and HR approve.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading leave requests…
            </div>
          ) : requests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No leave requests yet. Use Quick Actions to apply for leave.
            </p>
          ) : (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li
                  key={request.leave_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sgvu-navy">{leaveTypeLabel(request.leave_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWorkforceDateRange(request.start_date, request.end_date)}
                    </p>
                    {request.reason ? (
                      <p className="mt-0.5 max-w-lg truncate text-xs text-muted-foreground">{request.reason}</p>
                    ) : null}
                    {request.approver_remarks ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Note: {request.approver_remarks}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={statusBadgeVariant(request.status)} className="shrink-0 text-[10px]">
                    {leaveStatusLabel(request.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
