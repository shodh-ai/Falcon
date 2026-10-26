import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';
import type {
  CreateExamSessionDto,
  ExamSessionStatus,
} from './dto/exam-session.dto';

describe('ExamCellSessionsService', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const actorId = 'actor-a';
  const sessionId = '20000000-0000-4000-8000-000000000001';
  const input: CreateExamSessionDto = {
    academic_year: '2026-27',
    session_name: 'End semester',
    cycle_type: 'END_SEMESTER',
    semester: 4,
    program_label: 'B.Tech',
    start_date: '2026-11-01',
    end_date: '2026-11-30',
  };

  function setup(
    options: {
      currentStatus?: ExamSessionStatus;
      missing?: boolean;
      duplicate?: boolean;
      failOn?: string;
    } = {},
  ) {
    const events: string[] = [];
    const row = {
      session_id: sessionId,
      tenant_id: tenantId,
      status: options.currentStatus ?? 'DRAFT',
    };
    const query = jest.fn((sql: string, params: unknown[]) => {
      events.push(sql);
      if (options.failOn && sql.includes(options.failOn)) {
        return Promise.reject(new Error('required write failed'));
      }
      if (sql.includes('SELECT session_id FROM exam_sessions')) {
        return Promise.resolve(options.duplicate ? [row] : []);
      }
      if (sql.includes('SELECT * FROM exam_sessions')) {
        return Promise.resolve(options.missing ? [] : [{ ...row }]);
      }
      if (sql.includes('UPDATE exam_sessions')) {
        row.status = params[2] as ExamSessionStatus;
        return Promise.resolve([{ ...row }]);
      }
      if (sql.includes('INSERT INTO exam_sessions'))
        return Promise.resolve([{ ...row }]);
      return Promise.resolve([]);
    });
    const manager = { query };
    const db = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(
        async (callback: (m: typeof manager) => Promise<unknown>) => {
          try {
            const result = await callback(manager);
            events.push('commit');
            return result;
          } catch (error) {
            events.push('rollback');
            throw error;
          }
        },
      ),
    };
    const audit = new ExamCellAuditService(db as never);
    const auditLog = jest.spyOn(audit, 'log');
    const service = new ExamCellSessionsService(db as never, audit);
    return { service, db, query, manager, auditLog, events };
  }

  it('creates a draft with its audit in one transaction and locks before duplicate lookup', async () => {
    const { service, db, query, manager, auditLog, events } = setup();

    await expect(
      service.createSession(tenantId, actorId, input),
    ).resolves.toMatchObject({ status: 'DRAFT' });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[1][0]).toContain('SELECT session_id');
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining("'DRAFT'"),
      [
        tenantId,
        input.academic_year,
        input.session_name,
        input.cycle_type,
        4,
        'B.Tech',
        input.start_date,
        input.end_date,
        actorId,
      ],
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      tenantId,
      actorId,
      expect.objectContaining({
        action: 'EXAM_SESSION_CREATED',
        resource_id: sessionId,
      }),
      manager,
    );
    expect(events[events.length - 1]).toBe('commit');
    expect(events[events.length - 2]).toContain('INSERT INTO exam_audit_logs');
  });

  it('normalizes optional blanks to SQL null without fabricating dates or programme', async () => {
    const { service, query } = setup();
    await service.createSession(tenantId, actorId, {
      ...input,
      program_label: '',
      start_date: '',
      end_date: '',
      semester: undefined,
    });
    expect(query.mock.calls[2][1]).toEqual([
      tenantId,
      input.academic_year,
      input.session_name,
      input.cycle_type,
      null,
      null,
      null,
      null,
      actorId,
    ]);
  });

  it('rejects an exact existing configuration before any insert or audit', async () => {
    const { service, query, auditLog, events } = setup({ duplicate: true });
    await expect(
      service.createSession(tenantId, actorId, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(auditLog).not.toHaveBeenCalled();
    expect(events[events.length - 1]).toBe('rollback');
  });

  it('compares all configuration fields rather than forbidding reused names', async () => {
    const { service, query } = setup();
    await service.createSession(tenantId, actorId, input);
    const [sql, params] = query.mock.calls[1];
    for (const field of [
      'academic_year',
      'session_name',
      'cycle_type',
      'semester',
      'program_label',
      'start_date',
      'end_date',
    ]) {
      expect(sql).toContain(field);
    }
    expect(params).toHaveLength(8);
    expect(sql).not.toContain('status =');
  });

  it.each([
    { ...input, session_name: '  ' },
    { ...input, cycle_type: 'INVALID' },
    { ...input, status: 'ACTIVE' },
    { ...input, semester: 0 },
    { ...input, semester: 2147483648 },
    { ...input, end_date: '2026-10-01' },
    { ...input, start_date: '2026-02-30' },
  ])(
    'rejects invalid creation before opening a transaction: %j',
    async (invalid) => {
      const { service, db } = setup();
      await expect(
        service.createSession(
          tenantId,
          actorId,
          invalid as CreateExamSessionDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['INSERT INTO exam_sessions', 'INSERT INTO exam_audit_logs'])(
    'propagates required creation write failure: %s',
    async (failOn) => {
      const { service, events } = setup({ failOn });
      await expect(
        service.createSession(tenantId, actorId, input),
      ).rejects.toThrow('required write failed');
      expect(events).toContain('rollback');
      expect(events).not.toContain('commit');
    },
  );

  it.each<[ExamSessionStatus, ExamSessionStatus]>([
    ['DRAFT', 'OPEN'],
    ['OPEN', 'ACTIVE'],
    ['ACTIVE', 'CLOSED'],
  ])(
    'allows existing workflow transition %s → %s with tenant row lock and transactional audit',
    async (from, to) => {
      const { service, db, query, manager, auditLog } = setup({
        currentStatus: from,
      });
      await expect(
        service.updateSessionStatus(tenantId, sessionId, actorId, to),
      ).resolves.toMatchObject({ status: to });
      expect(db.query).not.toHaveBeenCalled();
      expect(query.mock.calls[0]).toEqual([
        expect.stringMatching(/tenant_id = \$2 FOR UPDATE/),
        [sessionId, tenantId],
      ]);
      expect(query.mock.calls[1][1]).toEqual([sessionId, tenantId, to]);
      expect(auditLog).toHaveBeenCalledWith(
        tenantId,
        actorId,
        expect.objectContaining({
          old_value: { status: from },
          new_value: { status: to },
        }),
        manager,
      );
    },
  );

  it.each<[ExamSessionStatus, ExamSessionStatus]>([
    ['DRAFT', 'ACTIVE'],
    ['DRAFT', 'CLOSED'],
    ['OPEN', 'DRAFT'],
    ['ACTIVE', 'OPEN'],
    ['CLOSED', 'OPEN'],
    ['CLOSED', 'ARCHIVED'],
    ['ARCHIVED', 'DRAFT'],
  ])(
    'rejects an unsupported transition %s → %s without writes',
    async (from, to) => {
      const { service, query, auditLog } = setup({ currentStatus: from });
      await expect(
        service.updateSessionStatus(tenantId, sessionId, actorId, to),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).toHaveBeenCalledTimes(1);
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  it.each<ExamSessionStatus>(['DRAFT', 'OPEN', 'ACTIVE', 'CLOSED', 'ARCHIVED'])(
    'does not duplicate a same-state %s request or audit',
    async (status) => {
      const { service, query, auditLog } = setup({ currentStatus: status });
      await expect(
        service.updateSessionStatus(tenantId, sessionId, actorId, status),
      ).resolves.toMatchObject({ status });
      expect(query).toHaveBeenCalledTimes(1);
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing or other-tenant session with no writes', async () => {
    const { service, query, auditLog } = setup({ missing: true });
    await expect(
      service.updateSessionStatus(tenantId, sessionId, actorId, 'OPEN'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it.each(['UPDATE exam_sessions', 'INSERT INTO exam_audit_logs'])(
    'propagates required transition write failure: %s',
    async (failOn) => {
      const { service, events } = setup({ failOn });
      await expect(
        service.updateSessionStatus(tenantId, sessionId, actorId, 'OPEN'),
      ).rejects.toThrow('required write failed');
      expect(events).toContain('rollback');
      expect(events).not.toContain('commit');
    },
  );

  it('rejects unknown state and missing tenant before opening a transaction', async () => {
    const { service, db } = setup();
    await expect(
      service.updateSessionStatus(tenantId, sessionId, actorId, 'INVALID'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createSession(' ', actorId, input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateSessionStatus('', sessionId, actorId, 'OPEN'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed authenticated tenant context on reads and writes before database access', async () => {
    const { service, db } = setup();
    expect(() => service.listSessions('not-a-tenant-uuid')).toThrow(
      ForbiddenException,
    );
    await expect(
      service.createSession('not-a-tenant-uuid', actorId, input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateSessionStatus(
        'not-a-tenant-uuid',
        sessionId,
        actorId,
        'OPEN',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed session ID in direct service calls before database access', async () => {
    const { service, db } = setup();
    await expect(
      service.updateSessionStatus(
        tenantId,
        'not-a-session-uuid',
        actorId,
        'OPEN',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
