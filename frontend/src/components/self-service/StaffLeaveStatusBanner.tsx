'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  formatWorkforceDateRange,
  leaveTypeLabel,
  leaveStatusLabel,
} from '@/lib/workforce-dates';
import { workforceMyRequestsApi } from '@/lib/workforce-api';
import { Button } from '@/components/ui/button';

type WorkforceRequest = {
  leave_id: string;
  request_type: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

const POLL_MS = 30_000;

export const WORKFORCE_STATUS_REFRESH_EVENT = 'falcon:workforce-status-refresh';

function isLeaveRelevant(endDate: string): boolean {
  const end = new Date(`${endDate.slice(0, 10)}T23:59:59`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return end >= cutoff;
}

export function StaffLeaveStatusBanner({ statusPath }: { statusPath: string }) {
  const api = useAuthedApi();
  const pathname = usePathname();
  const { user } = useAuth();
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [dismissedApprovedId, setDismissedApprovedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const data = await api.get<WorkforceRequest[]>(workforceMyRequestsApi(user, pathname));
      setRequests(data);
    } catch {
      /* banner is optional; ignore fetch errors */
    }
  }, [api, pathname, user?.user_id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener('falcon:notifications-refresh', onRefresh);
    window.addEventListener(WORKFORCE_STATUS_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener('falcon:notifications-refresh', onRefresh);
      window.removeEventListener(WORKFORCE_STATUS_REFRESH_EVENT, onRefresh);
    };
  }, [load]);

  useEffect(() => {
    if (!user?.user_id) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [load, user?.user_id]);

  const latestApproved = useMemo(
    () =>
      requests
        .filter((request) => request.status === 'HR_APPROVED' && request.request_type === 'LEAVE')
        .sort((a, b) => b.end_date.localeCompare(a.end_date))[0],
    [requests],
  );

  const pendingLeave = useMemo(
    () => requests.find((request) => request.status === 'PENDING' && request.request_type === 'LEAVE'),
    [requests],
  );

  const showApprovedBanner =
    latestApproved &&
    latestApproved.leave_id !== dismissedApprovedId &&
    isLeaveRelevant(latestApproved.end_date);

  if (!showApprovedBanner && !pendingLeave) return null;

  return (
    <div className="mb-4 space-y-2">
      {showApprovedBanner && latestApproved ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Your leave has been approved</p>
            <p className="mt-0.5 text-emerald-800/90">
              {leaveTypeLabel(latestApproved.leave_type)} ·{' '}
              {formatWorkforceDateRange(latestApproved.start_date, latestApproved.end_date)}
            </p>
            <Link
              href={statusPath}
              className="mt-1 inline-block text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
            >
              View leave requests
            </Link>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-emerald-700 hover:bg-emerald-100"
            onClick={() => setDismissedApprovedId(latestApproved.leave_id)}
            aria-label="Dismiss approval notice"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {pendingLeave ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Leave request pending approval</p>
            <p className="mt-0.5 text-amber-900/90">
              {leaveTypeLabel(pendingLeave.leave_type)} ·{' '}
              {formatWorkforceDateRange(pendingLeave.start_date, pendingLeave.end_date)} ·{' '}
              {leaveStatusLabel(pendingLeave.status)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
