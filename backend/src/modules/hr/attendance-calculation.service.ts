import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HrDailyAttendance, CalculatedAttendanceStatus } from '../../entities/hr-daily-attendance.entity';
import { HrHoliday } from '../../entities/hr-holiday.entity';
import { HrShift } from '../../entities/hr-shift.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { HrRulesService, type AttendanceRulesDto } from './hr-rules.service';
import { HrDynamicRulesService } from './hr-dynamic-rules.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

export type ShiftContext = {
  shift_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  grace_period_mins: number;
  half_day_min_hours: number;
  full_day_min_hours: number;
  week_off_day: number;
};

export type DayCalculationResult = {
  date: string;
  calculated_status: CalculatedAttendanceStatus;
  first_in_time: Date | null;
  last_out_time: Date | null;
  total_hours: number | null;
  shift: ShiftContext;
  tooltip: string;
};

@Injectable()
export class AttendanceCalculationService {
  private readonly logger = new Logger(AttendanceCalculationService.name);

  constructor(
    @InjectRepository(HrDailyAttendance) private readonly daily: Repository<HrDailyAttendance>,
    @InjectRepository(HrHoliday) private readonly holidays: Repository<HrHoliday>,
    @InjectRepository(HrShift) private readonly shifts: Repository<HrShift>,
    @InjectRepository(StaffLeaveRequest) private readonly requests: Repository<StaffLeaveRequest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rules: HrRulesService,
    private readonly dynamicRules: HrDynamicRulesService,
    private readonly notify: NotificationEmitterService,
  ) {}

  private async loadAttendanceContext(userId: string) {
    const profile = await this.dataSource.query<
      Array<{ tenant_id: string; entity_id: number }>
    >(
      `SELECT tenant_id, entity_id FROM hr_employee_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!profile[0]?.tenant_id || profile[0].entity_id == null) return null;

    const tenantId = profile[0].tenant_id;
    const entityId = Number(profile[0].entity_id);
    const shiftRow = await this.rules.getShiftForUser(tenantId, entityId, userId);
    let entityRules: Record<string, unknown> | null = null;
    try {
      entityRules = await this.rules.getRules(tenantId, entityId);
    } catch {
      entityRules = null;
    }
    return { tenantId, entityId, shiftRow, entityRules };
  }

  async getEmployeeShift(userId: string): Promise<ShiftContext> {
    const ctx = await this.loadAttendanceContext(userId);
    if (ctx?.shiftRow?.shift_id) {
      return this.shiftFromRow(ctx.shiftRow, ctx.entityRules);
    }

    if (ctx?.entityId) {
      const entityShift = await this.dataSource.query(
        `SELECT shift_id, shift_name, start_time::text, end_time::text,
                grace_period_mins, half_day_min_hours, full_day_min_hours, 0 AS week_off_day
         FROM hr_shifts WHERE entity_id = $1 ORDER BY shift_name LIMIT 1`,
        [ctx.entityId],
      );
      if (entityShift[0]) return this.shiftFromRow(entityShift[0], ctx.entityRules);
    }

    return this.shiftFromRow(
      {
        shift_id: '',
        shift_name: 'Default',
        start_time: '09:00:00',
        end_time: '17:00:00',
        grace_period_mins: ctx?.entityRules?.late_coming_max_mins ?? 15,
        half_day_min_hours: 4,
        full_day_min_hours: 8,
        week_off_day: 0,
      },
      ctx?.entityRules ?? null,
    );
  }

  private shiftFromRow(
    row: {
      shift_id: string;
      shift_name: string;
      start_time: string;
      end_time: string;
      grace_period_mins: unknown;
      half_day_min_hours: unknown;
      full_day_min_hours: unknown;
      week_off_day: unknown;
    },
    entityRules: Record<string, unknown> | null,
  ): ShiftContext {
    return {
      shift_id: row.shift_id,
      shift_name: row.shift_name,
      start_time: this.normalizeTime(row.start_time),
      end_time: this.normalizeTime(row.end_time),
      grace_period_mins: Number(entityRules?.late_coming_max_mins ?? row.grace_period_mins ?? 15),
      half_day_min_hours: Number(row.half_day_min_hours ?? 4),
      full_day_min_hours: Number(row.full_day_min_hours ?? 8),
      week_off_day: Number(row.week_off_day ?? 0),
    };
  }

  async calculateAndPersist(userId: string, date: string): Promise<DayCalculationResult> {
    const shift = await this.getEmployeeShift(userId);
    let row = await this.daily.findOne({ where: { user_id: userId, date } });

    const result = await this.calculateDay(userId, date, shift, row);

    if (!row) {
      row = this.daily.create({
        user_id: userId,
        date,
        status: result.first_in_time ? 'PRESENT' : 'ABSENT',
        is_regularized: false,
      });
    }

    row.calculated_status = result.calculated_status;
    if (result.first_in_time) row.first_in_time = result.first_in_time;
    if (result.last_out_time) row.last_out_time = result.last_out_time;
    if (result.first_in_time) {
      const liveHours = this.hoursBetween(result.first_in_time, result.last_out_time);
      row.total_hours = liveHours.toFixed(2);
      result.total_hours = liveHours;
    } else if (result.total_hours != null) {
      row.total_hours = result.total_hours.toFixed(2);
    }

    if (row.is_regularized && result.calculated_status === 'ABSENT') {
      row.calculated_status = 'FULL_DAY';
    }

    await this.daily.save(row);
    return result;
  }

  async calculateDay(
    userId: string,
    date: string,
    shift?: ShiftContext,
    row?: HrDailyAttendance | null,
  ): Promise<DayCalculationResult> {
    const shiftCtx = shift ?? (await this.getEmployeeShift(userId));
    const ctx = await this.loadAttendanceContext(userId);
    const earlyMaxMins = Number(ctx?.entityRules?.early_going_max_mins ?? 0);
    const attendance = row ?? (await this.daily.findOne({ where: { user_id: userId, date } }));

    const dow = new Date(`${date}T12:00:00`).getDay();
    if (dow === shiftCtx.week_off_day) {
      return this.buildResult(date, 'WEEK_OFF', attendance, shiftCtx);
    }

    const holiday = await this.holidays.findOne({ where: { date } });
    if (holiday) {
      const status: CalculatedAttendanceStatus =
        holiday.type === 'RESTRICTED' ? 'RESTRICTED_HOLIDAY' : 'HOLIDAY';
      return this.buildResult(date, status, attendance, shiftCtx);
    }

    const pending = await this.hasPendingRequest(userId, date);
    if (pending) {
      return this.buildResult(date, 'PENDING_REQUEST', attendance, shiftCtx);
    }

    if (attendance?.is_regularized) {
      return this.buildResult(date, 'FULL_DAY', attendance, shiftCtx);
    }

    if (!attendance?.first_in_time) {
      return this.buildResult(date, 'ABSENT', attendance, shiftCtx);
    }

    const hours = this.hoursBetween(attendance.first_in_time, attendance.last_out_time);
    const late = this.isLate(attendance.first_in_time, date, shiftCtx);
    const early = attendance.last_out_time
      ? this.isEarly(attendance.last_out_time, date, shiftCtx, earlyMaxMins)
      : false;

    let status: CalculatedAttendanceStatus;
    if (hours >= shiftCtx.full_day_min_hours) {
      status = late ? 'LATE_COMING' : early ? 'EARLY_GOING' : 'FULL_DAY';
    } else if (hours >= shiftCtx.half_day_min_hours) {
      status = 'HALF_DAY';
    } else if (hours > 0) {
      status = 'LESS_THAN_HALF_DAY';
    } else if (!attendance.last_out_time) {
      status = late ? 'LATE_COMING' : 'ABSENT';
    } else {
      status = 'LESS_THAN_HALF_DAY';
    }

    return this.buildResult(date, status, attendance, shiftCtx, hours);
  }

  async getMonthCalendar(userId: string, month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const start = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const end = `${year}-${String(monthNum).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [shift, ctx, attendanceRows, holidayRows, pendingRequests] = await Promise.all([
      this.getEmployeeShift(userId),
      this.loadAttendanceContext(userId),
      this.daily
        .createQueryBuilder('d')
        .where('d.user_id = :userId', { userId })
        .andWhere('d.date BETWEEN :start AND :end', { start, end })
        .getMany(),
      this.holidays
        .createQueryBuilder('h')
        .where('h.date BETWEEN :start AND :end', { start, end })
        .getMany(),
      this.requests
        .createQueryBuilder('r')
        .where('r.staff_user_id = :userId', { userId })
        .andWhere('r.status = :status', { status: 'PENDING' })
        .andWhere(
          '(r.regularization_date BETWEEN :start AND :end OR (r.start_date <= :end AND r.end_date >= :start))',
          { start, end },
        )
        .getMany(),
    ]);

    const attendanceByDate = new Map(attendanceRows.map((row) => [row.date, row]));
    const holidayByDate = new Map(holidayRows.map((holiday) => [holiday.date, holiday]));
    const pendingDates = this.buildPendingDatesSet(pendingRequests, start, end);
    const earlyMaxMins = Number(ctx?.entityRules?.early_going_max_mins ?? 0);

    const days: DayCalculationResult[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push(
        this.calculateDayCached(
          date,
          shift,
          attendanceByDate.get(date) ?? null,
          holidayByDate.get(date),
          pendingDates.has(date),
          earlyMaxMins,
        ),
      );
    }

    return { month, shift, days };
  }

  async getMatrixMonth(tenantId: string, month: string, entityId: number) {
    const params: unknown[] = [tenantId, entityId];
    const entityFilter = ` AND p.entity_id = $2`;
    const staff = await this.dataSource.query<Array<{ user_id: string; name: string }>>(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}
       ORDER BY u.name`,
      params,
    );

    const employees = await Promise.all(
      staff.map(async (s) => {
        const cal = await this.getMonthCalendar(s.user_id, month);
        return {
          user_id: s.user_id,
          name: s.name,
          days: cal.days.map((d) => ({
            date: d.date,
            calculated_status: d.calculated_status,
            tooltip: d.tooltip,
          })),
        };
      }),
    );

    return { month, employees };
  }

  @Cron('0 2 * * *')
  async nightlyRecalculateYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().slice(0, 10);
    const rows = await this.daily.find({ where: { date } });
    for (const row of rows) {
      try {
        const result = await this.calculateAndPersist(row.user_id, date);
        await this.evaluateDynamicRules(row.user_id, date, result);
      } catch (e) {
        this.logger.warn(`Recalc failed ${row.user_id} ${date}: ${e}`);
      }
    }
    this.logger.log(`Nightly attendance recalc for ${rows.length} records on ${date}`);
  }

  private async evaluateDynamicRules(userId: string, date: string, result: DayCalculationResult) {
    const profile = await this.dataSource.query(
      `SELECT tenant_id, entity_id FROM hr_employee_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!profile[0]?.tenant_id || profile[0].entity_id == null) return;

    await this.dynamicRules.evaluateRulesForDay(
      profile[0].tenant_id as string,
      Number(profile[0].entity_id),
      userId,
      date,
      result,
    );
  }

  private buildPendingDatesSet(
    requests: StaffLeaveRequest[],
    monthStart: string,
    monthEnd: string,
  ): Set<string> {
    const pending = new Set<string>();
    for (const req of requests) {
      if (req.regularization_date) {
        if (req.regularization_date >= monthStart && req.regularization_date <= monthEnd) {
          pending.add(req.regularization_date);
        }
        continue;
      }
      const rangeStart = req.start_date < monthStart ? monthStart : req.start_date;
      const rangeEnd = req.end_date > monthEnd ? monthEnd : req.end_date;
      const cursor = new Date(`${rangeStart}T12:00:00`);
      const end = new Date(`${rangeEnd}T12:00:00`);
      while (cursor <= end) {
        pending.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return pending;
  }

  /** Read-only day status for calendar views (no per-day DB writes). */
  private calculateDayCached(
    date: string,
    shiftCtx: ShiftContext,
    attendance: HrDailyAttendance | null,
    holiday: HrHoliday | undefined,
    hasPending: boolean,
    earlyMaxMins: number,
  ): DayCalculationResult {
    const dow = new Date(`${date}T12:00:00`).getDay();
    if (dow === shiftCtx.week_off_day) {
      return this.buildResult(date, 'WEEK_OFF', attendance, shiftCtx);
    }

    if (holiday) {
      const status: CalculatedAttendanceStatus =
        holiday.type === 'RESTRICTED' ? 'RESTRICTED_HOLIDAY' : 'HOLIDAY';
      return this.buildResult(date, status, attendance, shiftCtx);
    }

    if (hasPending) {
      return this.buildResult(date, 'PENDING_REQUEST', attendance, shiftCtx);
    }

    if (attendance?.is_regularized) {
      return this.buildResult(date, 'FULL_DAY', attendance, shiftCtx);
    }

    if (!attendance?.first_in_time) {
      return this.buildResult(date, 'ABSENT', attendance, shiftCtx);
    }

    const hours = this.hoursBetween(attendance.first_in_time, attendance.last_out_time);
    const late = this.isLate(attendance.first_in_time, date, shiftCtx);
    const early = attendance.last_out_time
      ? this.isEarly(attendance.last_out_time, date, shiftCtx, earlyMaxMins)
      : false;

    let status: CalculatedAttendanceStatus;
    if (hours >= shiftCtx.full_day_min_hours) {
      status = late ? 'LATE_COMING' : early ? 'EARLY_GOING' : 'FULL_DAY';
    } else if (hours >= shiftCtx.half_day_min_hours) {
      status = 'HALF_DAY';
    } else if (hours > 0) {
      status = 'LESS_THAN_HALF_DAY';
    } else if (!attendance.last_out_time) {
      status = late ? 'LATE_COMING' : 'ABSENT';
    } else {
      status = 'LESS_THAN_HALF_DAY';
    }

    return this.buildResult(date, status, attendance, shiftCtx, hours);
  }

  private async hasPendingRequest(userId: string, date: string) {
    const count = await this.requests
      .createQueryBuilder('r')
      .where('r.staff_user_id = :userId', { userId })
      .andWhere('r.status = :status', { status: 'PENDING' })
      .andWhere(
        `(r.regularization_date = :date OR (r.start_date <= :date AND r.end_date >= :date))`,
        { date },
      )
      .getCount();
    return count > 0;
  }

  private buildResult(
    date: string,
    status: CalculatedAttendanceStatus,
    row: HrDailyAttendance | null | undefined,
    shift: ShiftContext,
    hours?: number,
  ): DayCalculationResult {
    const inT = row?.first_in_time
      ? row.first_in_time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '--';
    const outT = row?.last_out_time
      ? row.last_out_time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '--';
    const label = status.replace(/_/g, ' ');
    const tooltip = `${this.formatDisplayDate(date)} | In: ${inT} | Out: ${outT} | Status: ${label}`;

    return {
      date,
      calculated_status: status,
      first_in_time: row?.first_in_time ?? null,
      last_out_time: row?.last_out_time ?? null,
      total_hours: hours ?? (row ? this.hoursBetween(row.first_in_time, row.last_out_time) : null),
      shift,
      tooltip,
    };
  }

  private formatDisplayDate(date: string) {
    const d = new Date(`${date}T12:00:00`);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private isLate(firstIn: Date, date: string, shift: ShiftContext): boolean {
    const graceEnd = this.shiftDateTime(date, shift.start_time, shift.grace_period_mins);
    return firstIn.getTime() > graceEnd.getTime();
  }

  private isEarly(lastOut: Date, date: string, shift: ShiftContext, earlyMaxMins = 0): boolean {
    const shiftEnd = this.shiftDateTime(date, shift.end_time, 0);
    const earliestAllowed = new Date(shiftEnd.getTime() - earlyMaxMins * 60 * 1000);
    return lastOut.getTime() < earliestAllowed.getTime();
  }

  private shiftDateTime(date: string, time: string, addMinutes: number) {
    const [h, m, s] = this.normalizeTime(time).split(':').map(Number);
    const d = new Date(`${date}T00:00:00`);
    d.setHours(h, m, s || 0, 0);
    d.setMinutes(d.getMinutes() + addMinutes);
    return d;
  }

  private normalizeTime(t: string) {
    if (!t) return '09:00:00';
    const parts = t.split(':');
    if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
    return t;
  }

  private hoursBetween(start?: Date | null, end?: Date | null): number {
    if (!start) return 0;
    const out = end ?? new Date();
    return Math.max(0, (out.getTime() - start.getTime()) / 36e5);
  }
}
