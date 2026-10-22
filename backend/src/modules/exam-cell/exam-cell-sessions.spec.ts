import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';

describe('Examination session dates', () => {
  function setup() {
    const query = jest
      .fn<Promise<Array<{ session_id: string }>>, [string, unknown[]]>()
      .mockResolvedValue([{ session_id: 'session' }]);
    const service = new ExamCellSessionsService(
      {
        transaction: (work: (manager: unknown) => unknown) => work({ query }),
      } as never,
      { log: jest.fn() } as never,
    );
    return { query, service };
  }
  const input = {
    academic_year: '2026-27',
    session_name: 'Synthetic session',
    cycle_type: 'END_SEMESTER' as const,
  };

  it('accepts optional empty dates from the creation form as null', async () => {
    const { query, service } = setup();
    await service.createSession('tenant', 'actor', {
      ...input,
      start_date: '',
      end_date: '',
    });
    expect(query.mock.calls[0][1].slice(6, 8)).toEqual([null, null]);
  });

  it.each([
    { start_date: '2026-02-30' },
    { start_date: 'not-a-date' },
    { start_date: '2026-11-20', end_date: '2026-11-10' },
  ])(
    'rejects invalid dates or reversed ranges before database writes: %o',
    async (dates) => {
      const { query, service } = setup();
      await expect(
        service.createSession('tenant', 'actor', { ...input, ...dates }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    },
  );
});

describe('Examination session mutation audit atomicity', () => {
  const input = {
    academic_year: '2026-27',
    session_name: 'Synthetic session',
    cycle_type: 'END_SEMESTER' as const,
  };

  function setup(auditFails = false, initialStatus?: string) {
    const outsideQuery = jest.fn();
    let committedSessions = initialStatus
      ? [{ session_id: 'session', status: initialStatus }]
      : [];
    let committedAudits: unknown[][] = [];
    const transaction = jest.fn(
      async (work: (manager: unknown) => Promise<unknown>) => {
        const sessions = committedSessions.map((row) => ({ ...row }));
        const audits = [...committedAudits];
        const query = jest.fn((sql: string, params: unknown[]) =>
          Promise.resolve().then(() => {
            if (sql.includes('INSERT INTO exam_sessions')) {
              const row = { session_id: 'session', status: String(params[8]) };
              sessions.push(row);
              return [row];
            }
            if (sql.includes('UPDATE exam_sessions')) {
              const row = sessions.find(
                (item) => item.session_id === params[0],
              );
              if (!row) return [];
              row.status = String(params[2]);
              return [row];
            }
            if (sql.includes('INSERT INTO exam_audit_logs')) {
              if (auditFails) throw new Error('audit write failed');
              audits.push(params);
              return [];
            }
            throw new Error(`Unexpected transaction query: ${sql}`);
          }),
        );
        const result = await work({ query });
        committedSessions = sessions;
        committedAudits = audits;
        return result;
      },
    );
    const db = { query: outsideQuery, transaction };
    const service = new ExamCellSessionsService(
      db as never,
      new ExamCellAuditService(db as never),
    );
    return {
      service,
      outsideQuery,
      transaction,
      state: () => ({ sessions: committedSessions, audits: committedAudits }),
    };
  }

  it('commits creation and its audit together, returning the created row', async () => {
    const test = setup();
    await expect(
      test.service.createSession('tenant', 'actor', input),
    ).resolves.toEqual({
      session_id: 'session',
      status: 'DRAFT',
    });
    expect(test.state().sessions).toHaveLength(1);
    expect(test.state().audits).toHaveLength(1);
    expect(test.state().audits[0].slice(0, 5)).toEqual([
      'tenant',
      'actor',
      'EXAM_SESSION_CREATED',
      'exam_session',
      'session',
    ]);
    expect(test.transaction).toHaveBeenCalledTimes(1);
    expect(test.outsideQuery).not.toHaveBeenCalled();
  });

  it('rolls back session creation if its audit cannot be written', async () => {
    const test = setup(true);
    await expect(
      test.service.createSession('tenant', 'actor', input),
    ).rejects.toThrow('audit write failed');
    expect(test.state()).toEqual({ sessions: [], audits: [] });
    expect(test.outsideQuery).not.toHaveBeenCalled();
  });

  it('commits a status change and audit together, returning a row object', async () => {
    const test = setup(false, 'DRAFT');
    await expect(
      test.service.updateSessionStatus('tenant', 'session', 'actor', 'ACTIVE'),
    ).resolves.toEqual({
      session_id: 'session',
      status: 'ACTIVE',
    });
    expect(test.state().audits).toHaveLength(1);
    expect(test.outsideQuery).not.toHaveBeenCalled();
  });

  it('rolls back the status change if its audit cannot be written', async () => {
    const test = setup(true, 'DRAFT');
    await expect(
      test.service.updateSessionStatus('tenant', 'session', 'actor', 'ACTIVE'),
    ).rejects.toThrow('audit write failed');
    expect(test.state()).toEqual({
      sessions: [{ session_id: 'session', status: 'DRAFT' }],
      audits: [],
    });
    expect(test.outsideQuery).not.toHaveBeenCalled();
  });

  it('does not write an audit when the requested session does not exist', async () => {
    const test = setup();
    await expect(
      test.service.updateSessionStatus('tenant', 'missing', 'actor', 'ACTIVE'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(test.state()).toEqual({ sessions: [], audits: [] });
    expect(test.outsideQuery).not.toHaveBeenCalled();
  });
});
