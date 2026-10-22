import { NotFoundException } from '@nestjs/common';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';

// TypeORM Postgres raw UPDATE returns [rows, affected]; a SELECT CTE returns rows.
const cases = [
  {
    name: 'form-window status',
    run: (ops: ExamCellOperationsService) =>
      ops.updateFormWindowStatus('tenant', 'record', 'actor', 'OPEN'),
  },
  {
    name: 'registration review',
    run: (ops: ExamCellOperationsService) =>
      ops.reviewRegistration('tenant', 'record', 'actor', 'APPROVED'),
  },
  {
    name: 'calendar reschedule',
    run: (
      _ops: ExamCellOperationsService,
      enterprise: ExamCellEnterpriseService,
    ) =>
      enterprise.updateCalendarEventDate(
        'tenant',
        'record',
        'actor',
        '2026-11-16',
      ),
  },
  {
    name: 'answer-sheet status',
    run: (
      _ops: ExamCellOperationsService,
      enterprise: ExamCellEnterpriseService,
    ) =>
      enterprise.updateAnswerSheetStatus(
        'tenant',
        'record',
        'actor',
        'COLLECTED',
      ),
  },
];

describe.each(cases)('$name persistence response', ({ run }) => {
  function setup(missing = false) {
    const record = { status: 'OPEN', record_id: 'record' };
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.trimStart().startsWith('WITH updated')
          ? missing
            ? []
            : [record]
          : [missing ? [] : [record], missing ? 0 : 1],
      ),
    );
    const manager = { query };
    const db = {
      query,
      transaction: (work: (executor: typeof manager) => Promise<unknown>) =>
        work(manager),
    };
    const audit = { log: jest.fn() };
    const ops = new ExamCellOperationsService(
      db as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
    );
    const enterprise = new ExamCellEnterpriseService(
      db as never,
      {} as never,
      {} as never,
      audit as never,
    );
    return { record, query, manager, audit, ops, enterprise };
  }

  it('returns the actual updated record and shares its transaction with the audit', async () => {
    const { ops, enterprise, record, manager, audit } = setup();
    await expect(run(ops, enterprise)).resolves.toEqual(record);
    expect(audit.log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.any(Object),
      manager,
    );
  });

  it('rejects an absent or foreign record without a success audit', async () => {
    const { ops, enterprise, audit } = setup(true);
    await expect(run(ops, enterprise)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('Calendar date-only API values', () => {
  it('selects date text for list/create/update rather than shifting a local date to UTC', async () => {
    const query = jest.fn().mockResolvedValue([{ event_id: 'event' }]);
    const manager = { query };
    const db = {
      query,
      transaction: (work: (executor: typeof manager) => Promise<unknown>) =>
        work(manager),
    };
    const service = new ExamCellEnterpriseService(
      db as never,
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
    );
    await service.listCalendarEvents('tenant', {});
    await service.createCalendarEvent('tenant', 'actor', {
      title: 'Synthetic',
      event_date: '2026-11-17',
    });
    await service.updateCalendarEventDate(
      'tenant',
      'event',
      'actor',
      '2026-11-17',
    );
    const queries = query.mock.calls.map(([sql]) => String(sql));
    expect(
      queries
        .filter((sql) => sql.includes('exam_calendar_events'))
        .every((sql) => sql.includes('event_date::text AS event_date')),
    ).toBe(true);
    expect(
      queries.find((sql) => sql.includes('FROM exam_schedules')),
    ).toContain('es.exam_date::text AS exam_date');
    expect(
      queries.find((sql) => sql.includes('ORDER BY exam_calendar_events')),
    ).toContain('ORDER BY exam_calendar_events.event_date');
  });
});
