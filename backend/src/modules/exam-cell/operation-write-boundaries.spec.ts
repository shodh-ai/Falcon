import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_ID = '22222222-2222-4222-8222-222222222222';
const SETTER_ID = '33333333-3333-4333-8333-333333333333';
const windowDto = {
  title: 'Synthetic form window',
  semester: 4,
  opens_at: '2026-11-01T09:00:00Z',
  closes_at: '2026-11-10T09:00:00Z',
};

function setup(
  options: {
    missingReference?: boolean;
    auditFailure?: boolean;
    missingPaper?: boolean;
  } = {},
) {
  const committed: string[] = [];
  let staged: string[] = [];
  const record = {
    window_id: 'window',
    qp_id: 'paper',
    event_id: 'event',
    status: 'COE_APPROVED',
  };
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    void _params;
    await Promise.resolve();
    if (sql.includes('FOR KEY SHARE')) {
      return options.missingReference
        ? []
        : [
            {
              session_id: SESSION_ID,
              exam_schedule_id: SCHEDULE_ID,
              user_id: SETTER_ID,
            },
          ];
    }
    if (sql.includes('INSERT INTO exam_audit_logs')) {
      if (options.auditFailure) throw new Error('Synthetic audit failure');
      staged.push('audit');
      return [];
    }
    if (sql.includes('WITH updated') && options.missingPaper) return [];
    staged.push(sql.includes('WITH updated') ? 'update' : 'insert');
    return [record];
  });
  const manager = { query };
  const outside = jest.fn(async () => {
    await Promise.resolve();
    throw new Error('Write or audit escaped the transaction');
  });
  const transaction = jest.fn(
    async (work: (executor: typeof manager) => Promise<unknown>) => {
      staged = [];
      try {
        const result = await work(manager);
        committed.push(...staged);
        return result;
      } finally {
        staged = [];
      }
    },
  );
  const db = { query: outside, transaction };
  const audit = new ExamCellAuditService(db as never);
  const auditLog = jest.spyOn(audit, 'log');
  const operations = new ExamCellOperationsService(
    db as never,
    {} as never,
    {} as never,
    audit,
    {} as never,

    {} as never,
  );
  const enterprise = new ExamCellEnterpriseService(
    db as never,
    {} as never,
    {} as never,
    audit,
  );
  return {
    committed,
    record,
    query,
    outside,
    transaction,
    manager,
    auditLog,
    operations,
    enterprise,
  };
}

describe('Tenant-owned operational references', () => {
  it('rejects a foreign or missing session before creating a form window', async () => {
    const { operations, query, committed, auditLog } = setup({
      missingReference: true,
    });
    await expect(
      operations.createFormWindow('tenant', 'actor', {
        ...windowDto,
        session_id: SESSION_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE tenant_id = $1 AND session_id = $2 FOR KEY SHARE',
      ),
      ['tenant', SESSION_ID],
    );
    expect(committed).toEqual([]);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('accepts an owned session and saves the window and audit together', async () => {
    const { operations, query, committed, record } = setup();
    await expect(
      operations.createFormWindow('tenant', 'actor', {
        ...windowDto,
        session_id: SESSION_ID,
      }),
    ).resolves.toEqual(record);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_form_windows'),
      expect.arrayContaining(['tenant', SESSION_ID]),
    );
    expect(committed).toEqual(['insert', 'audit']);
  });

  it.each([{ exam_schedule_id: SCHEDULE_ID }, { setter_user_id: SETTER_ID }])(
    'rejects a foreign or missing question-paper reference: %j',
    async (dto) => {
      const { operations, query, committed } = setup({
        missingReference: true,
      });
      await expect(
        operations.createQuestionPaperRecord('tenant', 'actor', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[0]).toContain('WHERE tenant_id = $1 AND');
      expect(query.mock.calls[0]?.[1]).toEqual([
        'tenant',
        Object.values(dto)[0],
      ]);
      expect(committed).toEqual([]);
    },
  );

  it('validates both owned question-paper references before insertion', async () => {
    const { operations, query, committed, record } = setup();
    await expect(
      operations.createQuestionPaperRecord('tenant', 'actor', {
        exam_schedule_id: SCHEDULE_ID,
        setter_user_id: SETTER_ID,
      }),
    ).resolves.toEqual(record);
    expect(query.mock.calls[0]?.[0]).toContain('FROM exam_schedules');
    expect(query.mock.calls[1]?.[0]).toContain('FROM users');
    expect(query.mock.calls[2]?.[0]).toContain(
      'INSERT INTO public.exam_question_papers',
    );
    expect(committed).toEqual(['insert', 'audit']);
  });

  it.each(['session_id', 'exam_schedule_id', 'setter_user_id'] as const)(
    'rejects malformed %s before starting a transaction',
    async (field) => {
      const { operations, transaction } = setup();
      const action =
        field === 'session_id'
          ? operations.createFormWindow('tenant', 'actor', {
              ...windowDto,
              session_id: 'invalid',
            })
          : operations.createQuestionPaperRecord('tenant', 'actor', {
              [field]: 'invalid',
            });
      await expect(action).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('scopes joins so historical foreign references cannot expose names or schedules', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockResolvedValue([]);
    const operations = new ExamCellOperationsService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,

      {} as never,
    );
    await operations.listFormWindows('tenant');
    await operations.listQuestionPapers('tenant');
    await operations.listRegistrations('tenant', {});
    expect(query.mock.calls[0]?.[0]).toContain('s.tenant_id = w.tenant_id');
    expect(query.mock.calls[1]?.[0]).toContain('es.tenant_id = qp.tenant_id');
    expect(query.mock.calls[1]?.[0]).toContain(
      'setter.tenant_id = qp.tenant_id',
    );
    expect(query.mock.calls[2]?.[0]).toContain('u.tenant_id = r.tenant_id');
    expect(query.mock.calls[2]?.[0]).toContain('w.tenant_id = r.tenant_id');
  });
});

const writes = [
  {
    name: 'calendar creation',
    run: (s: ReturnType<typeof setup>) =>
      s.enterprise.createCalendarEvent('tenant', 'actor', {
        title: 'Synthetic milestone',
        event_date: '2026-11-01',
      }),
    kind: 'insert',
  },
  {
    name: 'form-window creation without optional session',
    run: (s: ReturnType<typeof setup>) =>
      s.operations.createFormWindow('tenant', 'actor', windowDto),
    kind: 'insert',
  },
  {
    name: 'question-paper creation without optional references',
    run: (s: ReturnType<typeof setup>) =>
      s.operations.createQuestionPaperRecord('tenant', 'actor', {
        subject_id: 1,
      }),
    kind: 'insert',
  },
  {
    name: 'question-paper status update',
    run: (s: ReturnType<typeof setup>) =>
      s.operations.updateQuestionPaperStatus(
        'tenant',
        'paper',
        'actor',
        'COE_APPROVED',
      ),
    kind: 'update',
  },
];

describe.each(writes)('$name atomic audit boundary', ({ run, kind }) => {
  it('commits the mutation and audit through one transaction executor', async () => {
    const state = setup();
    await expect(run(state)).resolves.toEqual(state.record);
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.auditLog).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.any(Object),
      state.manager,
    );
    expect(state.outside).not.toHaveBeenCalled();
    expect(state.committed).toEqual([kind, 'audit']);
  });

  it('propagates audit failure and does not commit the mutation', async () => {
    const state = setup({ auditFailure: true });
    await expect(run(state)).rejects.toThrow('Synthetic audit failure');
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_audit_logs'),
      expect.any(Array),
    );
    expect(state.outside).not.toHaveBeenCalled();
    expect(state.committed).toEqual([]);
  });
});

it('returns 404 for a missing or foreign question paper without writing an audit', async () => {
  const state = setup({ missingPaper: true });
  await expect(
    state.operations.updateQuestionPaperStatus(
      'tenant',
      'paper',
      'actor',
      'COE_APPROVED',
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(state.auditLog).not.toHaveBeenCalled();
  expect(state.committed).toEqual([]);
});
