import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import {
  MarkExamDayAttendanceDto,
  EXAM_DAY_ATTENDANCE_STATUSES,
} from './dto/exam-day.dto';

const tenantId = '11111111-1111-4111-8111-111111111111';
const scheduleId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const otherTenantId = '55555555-5555-4555-8555-555555555555';
const dto: MarkExamDayAttendanceDto = {
  exam_schedule_id: scheduleId,
  student_user_id: studentId,
  status: 'PRESENT',
};

type Row = Record<string, unknown>;

function createService(
  options: {
    scheduleExists?: boolean;
    rosterExists?: boolean;
    existingAttendance?: Row;
    failWrite?: boolean;
    failAudit?: boolean;
    scriptConflict?: 'RECEIPT' | 'MISSING';
  } = {},
) {
  let committedAttendance = options.existingAttendance;
  let pendingAttendance: Row | undefined;
  const events: string[] = [];
  const query = jest.fn<Promise<Row[]>, [string, unknown[]?]>(
    (sql, params = []) => {
      if (sql.includes('FROM exam_schedules')) {
        return Promise.resolve(
          options.scheduleExists === false
            ? []
            : [{ exam_schedule_id: scheduleId }],
        );
      }
      if (sql.includes('FROM exam_seating_allocations')) {
        return Promise.resolve(
          options.rosterExists === false ? [] : [{ seating_id: 'seating-a' }],
        );
      }
      if (sql.includes("SELECT 'RECEIPT' AS kind")) {
        return Promise.resolve(
          options.scriptConflict ? [{ kind: options.scriptConflict }] : [],
        );
      }
      if (sql.includes('INSERT INTO exam_day_attendance')) {
        events.push('write');
        if (options.failWrite)
          return Promise.reject(new Error('attendance write failed'));
        if (pendingAttendance && pendingAttendance.tenant_id !== params[0])
          return Promise.resolve([]);
        pendingAttendance = {
          attendance_id: pendingAttendance?.attendance_id ?? 'attendance-a',
          tenant_id: params[0],
          exam_schedule_id: params[1],
          student_user_id: params[2],
          status: params[3],
          marked_by: params[4],
        };
        return Promise.resolve([pendingAttendance]);
      }
      return Promise.resolve([]);
    },
  );
  const manager = { query } as unknown as EntityManager;
  const db = {
    query: jest
      .fn<Promise<Row[]>, [string, unknown[]?]>()
      .mockResolvedValue([]),
    transaction: jest.fn(
      async (callback: (transaction: EntityManager) => Promise<unknown>) => {
        pendingAttendance = committedAttendance
          ? { ...committedAttendance }
          : undefined;
        events.push('begin');
        try {
          const result = await callback(manager);
          committedAttendance = pendingAttendance;
          events.push('commit');
          return result;
        } catch (error) {
          events.push('rollback');
          throw error;
        }
      },
    ),
  };
  const audit = {
    log: jest.fn(() => {
      events.push('audit');
      return options.failAudit
        ? Promise.reject(new Error('audit failed'))
        : Promise.resolve();
    }),
  };
  const service = new ExamCellOperationsService(
    db as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    db,
    manager,
    query,
    audit,
    events,
    committed: () => committedAttendance,
  };
}

describe('Exam Day attendance scoped writes', () => {
  it.each(EXAM_DAY_ATTENDANCE_STATUSES)(
    'saves existing permitted status %s for an owned roster entry',
    async (status) => {
      const { service, db, query, manager, audit, events, committed } =
        createService();
      const result = await service.markExamDayAttendance(tenantId, actorId, {
        ...dto,
        status,
      });
      expect(result).toMatchObject({
        status,
        student_user_id: studentId,
        tenant_id: tenantId,
      });
      expect(committed()).toEqual(result);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.query).not.toHaveBeenCalled();
      expect(query.mock.calls[0][0]).toContain(
        'WHERE tenant_id = $1 AND exam_schedule_id = $2',
      );
      // The stronger schedule lock serializes attendance with physical receipts.
      expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(query.mock.calls[0][1]).toEqual([tenantId, scheduleId]);
      expect(query.mock.calls[1][0]).toContain('u.tenant_id = esa.tenant_id');
      expect(query.mock.calls[1][0]).toContain(
        'esa.tenant_id = $1 AND esa.exam_schedule_id = $2 AND esa.student_user_id = $3',
      );
      expect(query.mock.calls[1][0]).toContain('FOR SHARE OF esa, u');
      expect(query.mock.calls[1][1]).toEqual([tenantId, scheduleId, studentId]);
      const write = query.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO exam_day_attendance'),
      )!;
      expect(write[0]).toContain(
        'WHERE exam_day_attendance.tenant_id = EXCLUDED.tenant_id',
      );
      expect(write[1]).toEqual([
        tenantId,
        scheduleId,
        studentId,
        status,
        actorId,
      ]);
      expect(audit.log).toHaveBeenCalledWith(
        tenantId,
        actorId,
        {
          action: 'EXAM_DAY_ATTENDANCE_MARKED',
          resource_type: 'exam_day_attendance',
          resource_id: 'attendance-a',
          new_value: {
            status,
            exam_schedule_id: scheduleId,
            student_user_id: studentId,
          },
        },
        manager,
      );
      expect(events).toEqual(['begin', 'write', 'audit', 'commit']);
    },
  );

  it.each(['RECEIPT', 'MISSING'] as const)(
    'blocks absence conflicting with %s without a write or success audit',
    async (scriptConflict) => {
      const { service, query, audit, committed } = createService({
        scriptConflict,
      });
      await expect(
        service.markExamDayAttendance(tenantId, actorId, {
          ...dto,
          status: 'ABSENT',
        }),
      ).rejects.toThrow('Resolve the script');
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO exam_day_attendance'),
        ),
      ).toBe(false);
      expect(audit.log).not.toHaveBeenCalled();
      expect(committed()).toBeUndefined();
    },
  );

  it('rejects an unknown or foreign-tenant schedule before looking up students or writing', async () => {
    const { service, query, audit, events, committed } = createService({
      scheduleExists: false,
    });
    await expect(
      service.markExamDayAttendance(tenantId, actorId, dto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(audit.log).not.toHaveBeenCalled();
    expect(committed()).toBeUndefined();
    expect(events).toEqual(['begin', 'rollback']);
  });

  it('rejects unseated, wrong-exam, or foreign-tenant students without attendance writes', async () => {
    const { service, query, audit, events } = createService({
      rosterExists: false,
    });
    await expect(
      service.markExamDayAttendance(tenantId, actorId, dto),
    ).rejects.toThrow('Student is not on this examination roster');
    expect(query).toHaveBeenCalledTimes(2);
    expect(audit.log).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'rollback']);
  });

  it('does not overwrite an inconsistent foreign-tenant attendance conflict', async () => {
    const existing = {
      attendance_id: 'foreign-attendance',
      tenant_id: otherTenantId,
      status: 'ABSENT',
    };
    const { service, committed, audit, events } = createService({
      existingAttendance: existing,
    });
    await expect(
      service.markExamDayAttendance(tenantId, actorId, dto),
    ).rejects.toThrow('Attendance record scope is inconsistent');
    expect(committed()).toEqual(existing);
    expect(audit.log).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'write', 'rollback']);
  });

  it('updates the same scoped attendance row on repeated marking', async () => {
    const { service, committed, query } = createService();
    const first = await service.markExamDayAttendance(tenantId, actorId, dto);
    const second = await service.markExamDayAttendance(tenantId, actorId, {
      ...dto,
      status: 'LATE',
    });
    expect(second.attendance_id).toBe(first.attendance_id);
    expect(committed()).toMatchObject({
      attendance_id: first.attendance_id,
      status: 'LATE',
    });
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO exam_day_attendance'),
      ),
    ).toHaveLength(2);
    expect(query.mock.calls[2][0]).toContain(
      'ON CONFLICT (exam_schedule_id, student_user_id)',
    );
  });

  it.each(['write', 'audit'] as const)(
    'rejects and rolls back the mocked transaction on %s failure',
    async (failure) => {
      const existing = {
        attendance_id: 'attendance-a',
        tenant_id: tenantId,
        status: 'ABSENT',
      };
      const { service, committed, audit, events } = createService({
        existingAttendance: existing,
        failWrite: failure === 'write',
        failAudit: failure === 'audit',
      });
      await expect(
        service.markExamDayAttendance(tenantId, actorId, dto),
      ).rejects.toThrow(
        failure === 'write' ? 'attendance write failed' : 'audit failed',
      );
      expect(committed()).toEqual(existing);
      expect(events).toContain('rollback');
      expect(events).not.toContain('commit');
      if (failure === 'write') expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it.each(['', ' ', 'not-a-tenant'])(
    'rejects missing or invalid tenant %p before a transaction',
    async (tenant) => {
      const { service, db } = createService();
      await expect(
        service.markExamDayAttendance(tenant, actorId, dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { exam_schedule_id: 'not-a-uuid' },
    { student_user_id: 'not-a-uuid' },
    { status: 'INVALID' },
  ])('rejects invalid input %p before a transaction', async (invalid) => {
    const { service, db } = createService();
    await expect(
      service.markExamDayAttendance(tenantId, actorId, { ...dto, ...invalid }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('Exam Day attendance read boundaries', () => {
  it('reads only matching tenant schedules, roster identities, attendance and markers', async () => {
    const { service, db } = createService();
    await service.listTodayExams(tenantId);
    await service.listExamDayRoster(tenantId, scheduleId);
    await service.listExamDayAttendance(tenantId, scheduleId);
    expect(db.query.mock.calls[0][0]).toContain('da.tenant_id = es.tenant_id');
    expect(db.query.mock.calls[1][0]).toContain('es.tenant_id = esa.tenant_id');
    expect(db.query.mock.calls[1][0]).toContain('u.tenant_id = esa.tenant_id');
    expect(db.query.mock.calls[1][0]).toContain('da.tenant_id = esa.tenant_id');
    expect(db.query.mock.calls[2][0]).toContain('es.tenant_id = da.tenant_id');
    expect(db.query.mock.calls[2][0]).toContain('u.tenant_id = da.tenant_id');
    expect(db.query.mock.calls[2][0]).toContain(
      'marker.tenant_id = da.tenant_id',
    );
    expect(db.query.mock.calls[1][1]).toEqual([tenantId, scheduleId]);
    expect(db.query.mock.calls[2][1]).toEqual([tenantId, scheduleId]);
  });

  it.each(['today', 'roster', 'attendance'] as const)(
    'does not turn %s database/schema failures into an empty success',
    async (reader) => {
      const { service, db } = createService();
      db.query.mockRejectedValue(
        new Error('relation exam_day_attendance does not exist'),
      );
      const request =
        reader === 'today'
          ? service.listTodayExams(tenantId)
          : reader === 'roster'
            ? service.listExamDayRoster(tenantId, scheduleId)
            : service.listExamDayAttendance(tenantId, scheduleId);
      await expect(request).rejects.toThrow(
        'relation exam_day_attendance does not exist',
      );
    },
  );

  it.each(['roster', 'attendance'] as const)(
    'rejects malformed schedule ID on %s reads before database access',
    async (reader) => {
      const { service, db } = createService();
      const request =
        reader === 'roster'
          ? service.listExamDayRoster(tenantId, 'bad')
          : service.listExamDayAttendance(tenantId, 'bad');
      await expect(request).rejects.toBeInstanceOf(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    },
  );
});

describe('MarkExamDayAttendanceDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = {
    type: 'body' as const,
    metatype: MarkExamDayAttendanceDto,
  };

  it('accepts existing identifiers and attendance states', async () => {
    await expect(pipe.transform(dto, metadata)).resolves.toEqual(dto);
  });

  it.each([
    { ...dto, exam_schedule_id: 'bad' },
    { ...dto, student_user_id: '' },
    { ...dto, status: 'CHECKED' },
    { ...dto, tenant_id: otherTenantId },
    { ...dto, marked_by: studentId },
  ])(
    'rejects invalid IDs/status or client-supplied authorization fields',
    async (body) => {
      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
