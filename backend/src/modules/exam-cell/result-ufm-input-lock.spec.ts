import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ExamCellService } from './exam-cell.service';

type Mark = {
  mark_id: string;
  course_id: string;
  exam_type: string;
  status: string;
};
type Session = {
  declared_at: string | null;
  marks_locked: boolean;
  entry_status: string;
};

describe('UFM result input protection (mocked transactions)', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const studentId = '10000000-0000-4000-8000-000000000002';
  const actorId = '10000000-0000-4000-8000-000000000003';
  const courseId = '10000000-0000-4000-8000-000000000004';
  const otherCourseId = '10000000-0000-4000-8000-000000000005';
  const markId = '10000000-0000-4000-8000-000000000006';
  const caseId = '10000000-0000-4000-8000-000000000007';
  const originalMark: Mark = {
    mark_id: markId,
    course_id: courseId,
    exam_type: 'END_TERM',
    status: 'PENDING_COE',
  };
  const dto = {
    student_user_id: studentId,
    course_id: courseId,
    description: 'Test incident',
    reported_by: actorId,
  };

  function setup(options?: {
    candidates?: Mark[];
    lockedMarks?: Mark[];
    sessions?: Session[];
    failSql?: string;
    failAudit?: boolean;
    missingStudent?: boolean;
  }) {
    const candidates = options?.candidates ?? [originalMark];
    const events: string[] = [];
    const query = jest.fn(async (sql: string, params: unknown[]) => {
      events.push(sql);
      if (options?.failSql && sql.includes(options.failSql)) {
        throw new Error('Required write failed');
      }
      if (sql.includes('FROM academic_marks')) {
        return sql.includes('FOR UPDATE')
          ? (options?.lockedMarks ?? candidates)
          : candidates;
      }
      if (sql.includes('FROM exam_result_sessions')) {
        expect(params[0]).toBe(tenantId);
        return options?.sessions ?? [];
      }
      if (sql.includes('INSERT INTO ufm_cases')) return [{ case_id: caseId }];
      if (sql.includes('FROM ufm_cases c')) {
        return [{ case_id: caseId, student_name: 'Test student' }];
      }
      return [];
    });
    const manager = { query };
    const transaction = jest.fn(
      async (callback: (value: EntityManager) => Promise<unknown>) => {
        events.push('BEGIN');
        try {
          const value = await callback(manager as unknown as EntityManager);
          events.push('COMMIT');
          return value;
        } catch (error) {
          events.push('ROLLBACK');
          throw error;
        }
      },
    );
    const globalQuery = jest.fn(async (sql: string) => {
      if (/\b(INSERT|UPDATE|DELETE)\b/.test(sql)) {
        throw new Error('Unexpected non-transactional write');
      }
      if (sql.includes('SELECT u.user_id')) {
        return options?.missingStudent ? [] : [{ user_id: studentId }];
      }
      if (sql.includes('SELECT course_id')) return [{ course_id: courseId }];
      if (sql.includes('SELECT course_code'))
        return [{ course_code: 'TEST101' }];
      throw new Error(`Unexpected global query: ${sql}`);
    });
    const audit = {
      log: jest.fn(async () => {
        events.push('AUDIT');
        if (options?.failAudit) throw new Error('Audit write failed');
      }),
    };
    const service = new ExamCellService(
      { query: globalQuery, transaction } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
    );
    const writes = () =>
      query.mock.calls.filter(([sql]) =>
        /\b(INSERT|UPDATE|DELETE)\b/.test(sql.replace(/FOR UPDATE/g, '')),
      );
    return { service, query, transaction, audit, manager, events, writes };
  }

  it('commits the existing UFM action and strict audit through one transaction', async () => {
    const { service, query, transaction, audit, manager, events } = setup();
    await expect(service.createUfmCase(tenantId, dto)).resolves.toEqual({
      case_id: caseId,
      student_name: 'Test student',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE academic_marks'),
      [studentId, tenantId, [markId]],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ufm_cases'),
      [
        tenantId,
        studentId,
        null,
        '[TEST101] Test incident',
        'Exam cancelled — UFM',
        actorId,
      ],
    );
    expect(audit.log).toHaveBeenCalledWith(
      tenantId,
      actorId,
      expect.objectContaining({
        action: 'UFM_MARKS_INVALIDATED',
        resource_id: caseId,
        new_value: expect.objectContaining({ affected_mark_count: 1 }),
      }),
      manager,
    );
    expect(events.indexOf('AUDIT')).toBeLessThan(events.indexOf('COMMIT'));
  });

  it.each([
    {
      declared_at: '2026-10-21T10:00:00Z',
      marks_locked: false,
      entry_status: 'OPEN',
    },
    { declared_at: null, marks_locked: true, entry_status: 'CLOSED' },
    { declared_at: null, marks_locked: false, entry_status: 'LOCKED' },
  ])(
    'rejects protected result sessions before any UFM write: %j',
    async (session) => {
      const { service, writes, audit, events } = setup({ sessions: [session] });
      await expect(service.createUfmCase(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(writes()).toHaveLength(0);
      expect(audit.log).not.toHaveBeenCalled();
      expect(events).toContain('ROLLBACK');
      expect(events).not.toContain('COMMIT');
    },
  );

  it('rechecks locked mark rows and rejects a publication that won the input lock', async () => {
    const { service, writes, query } = setup({
      lockedMarks: [{ ...originalMark, status: 'PUBLISHED' }],
    });
    await expect(service.createUfmCase(tenantId, dto)).rejects.toThrow(
      'Cannot change published marks',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('mark_id = ANY($3::uuid[])'),
      [tenantId, studentId, [markId]],
    );
    expect(writes()).toHaveLength(0);
  });

  it('locks every distinct input pair in stable order before session or mark row locks', async () => {
    const marks: Mark[] = [
      { ...originalMark, mark_id: 'mark-3', course_id: otherCourseId },
      { ...originalMark, mark_id: 'mark-2', exam_type: 'CAT1' },
      originalMark,
      { ...originalMark, mark_id: 'mark-4' },
    ];
    const { service, query } = setup({ candidates: marks });
    await service.createUfmCase(tenantId, { ...dto, course_id: undefined });
    const calls = query.mock.calls;
    const lockCalls = calls.filter(([sql]) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    const keys = lockCalls.map(([, params]) => params[0] as string);
    expect(keys).toEqual(
      [
        JSON.stringify(['result-input', tenantId, courseId, 'CAT1']),
        JSON.stringify(['result-input', tenantId, courseId, 'END_TERM']),
        JSON.stringify(['result-input', tenantId, otherCourseId, 'END_TERM']),
      ].sort(),
    );
    const firstRowLock = calls.findIndex(([sql]) => sql.includes('FOR UPDATE'));
    const lastInputLock = calls.findLastIndex(([sql]) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    expect(lastInputLock).toBeLessThan(firstRowLock);
  });

  it('restricts mark updates to the examined IDs instead of newly inserted rows', async () => {
    const { service, query } = setup();
    await service.createUfmCase(tenantId, dto);
    const update = query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE academic_marks'),
    );
    expect(update?.[0]).toContain('mark_id = ANY($3::uuid[])');
    expect(update?.[1]).toEqual([studentId, tenantId, [markId]]);
  });

  it.each([
    { lockedMarks: [] },
    { lockedMarks: [{ ...originalMark, course_id: otherCourseId }] },
  ])(
    'rejects disappeared or moved target marks instead of writing an unvalidated batch: %j',
    async ({ lockedMarks }) => {
      const { service, writes } = setup({ lockedMarks });
      await expect(service.createUfmCase(tenantId, dto)).rejects.toThrow(
        'The marks batch changed',
      );
      expect(writes()).toHaveLength(0);
    },
  );

  it.each([
    'INSERT INTO ufm_cases',
    'UPDATE academic_marks',
    'UPDATE grade_cards',
    'INSERT INTO grade_cards',
  ])('propagates a failed %s through the transaction', async (failSql) => {
    const { service, events, audit } = setup({ failSql });
    await expect(service.createUfmCase(tenantId, dto)).rejects.toThrow(
      'Required write failed',
    );
    expect(events).toContain('ROLLBACK');
    expect(events).not.toContain('COMMIT');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('propagates a required audit failure instead of reporting successful application', async () => {
    const { service, events } = setup({ failAudit: true });
    await expect(service.createUfmCase(tenantId, dto)).rejects.toThrow(
      'Audit write failed',
    );
    expect(events).toContain('ROLLBACK');
    expect(events).not.toContain('COMMIT');
  });

  it('retains tenant-scoped student lookup before beginning a mutation', async () => {
    const { service, transaction } = setup({ missingStudent: true });
    await expect(service.createUfmCase(tenantId, dto)).rejects.toThrow(
      'Student not found',
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
