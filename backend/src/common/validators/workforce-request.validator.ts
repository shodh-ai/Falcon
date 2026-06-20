import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';

export const WORKFORCE_RETROACTIVE_DAYS = 3;

const HR_BYPASS_ROLES = new Set(['HRAdmin', 'SuperAdmin', 'HR']);

const BLOCKING_STATUSES = ['PENDING', 'HOD_APPROVED', 'HR_APPROVED'] as const;

function calendarDaysDiff(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function earliestDate(
  requestType: StaffRequestType,
  startDate: string,
  endDate: string,
  regularizationDate?: string | null,
): string {
  if (requestType === 'REGULARIZATION' && regularizationDate) {
    return regularizationDate.slice(0, 10);
  }
  return startDate.slice(0, 10) <= endDate.slice(0, 10)
    ? startDate.slice(0, 10)
    : endDate.slice(0, 10);
}

/** Blocks OD / leave / regularization dates more than 3 calendar days in the past (HR roles bypass). */
export function assertRetroactiveWorkforceLimit(
  requestType: StaffRequestType,
  startDate: string,
  endDate: string,
  actorRoles: string[],
  regularizationDate?: string | null,
): void {
  if (!['LEAVE', 'ON_DUTY', 'REGULARIZATION'].includes(requestType)) return;
  if (actorRoles.some((r) => HR_BYPASS_ROLES.has(r))) return;

  const today = new Date();
  const earliest = earliestDate(
    requestType,
    startDate,
    endDate,
    regularizationDate,
  );
  const daysSinceEarliest = calendarDaysDiff(today, parseDateOnly(earliest));

  if (daysSinceEarliest > WORKFORCE_RETROACTIVE_DAYS) {
    throw new ForbiddenException(
      'You cannot apply for OD/leaves older than 3 days. Please contact HR to unlock past dates.',
    );
  }
}

type OverlapRow = {
  leave_id: string;
  request_type: StaffRequestType;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  regularization_date: string | null;
};

export async function assertNoOverlappingWorkforceDates(
  dataSource: DataSource,
  tenantId: string,
  staffUserId: string,
  startDate: string,
  endDate: string,
  requestType: StaffRequestType,
  regularizationDate?: string | null,
): Promise<void> {
  const rangeStart =
    requestType === 'REGULARIZATION' && regularizationDate
      ? regularizationDate.slice(0, 10)
      : startDate.slice(0, 10);
  const rangeEnd =
    requestType === 'REGULARIZATION' && regularizationDate
      ? regularizationDate.slice(0, 10)
      : endDate.slice(0, 10);

  const rows = await dataSource.query<OverlapRow[]>(
    `SELECT leave_id, request_type, leave_type, start_date::text, end_date::text, regularization_date::text
     FROM staff_leave_requests
     WHERE tenant_id = $1
       AND staff_user_id = $2
       AND status = ANY($3::varchar[])
       AND (
         (request_type = 'REGULARIZATION' AND regularization_date BETWEEN $4::date AND $5::date)
         OR (request_type <> 'REGULARIZATION' AND start_date <= $5::date AND end_date >= $4::date)
       )
     LIMIT 1`,
    [tenantId, staffUserId, BLOCKING_STATUSES, rangeStart, rangeEnd],
  );

  const existing = rows[0];
  if (!existing) return;

  const label = existing.request_type.replace(/_/g, ' ').toLowerCase();
  const dateHint =
    existing.request_type === 'REGULARIZATION'
      ? existing.regularization_date
      : existing.start_date === existing.end_date
        ? existing.start_date
        : `${existing.start_date} – ${existing.end_date}`;

  throw new ConflictException(
    `You already have a ${label} request for ${dateHint}. Duplicates are not allowed.`,
  );
}
