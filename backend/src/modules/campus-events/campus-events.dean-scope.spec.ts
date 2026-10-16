import { ForbiddenException } from '@nestjs/common';
import { CampusEventsService } from './campus-events.service';
import { resolveDeanScope } from '../academics/dean-scope.util';

jest.mock('../academics/dean-scope.util', () => ({
  resolveDeanScope: jest.fn(),
}));

const mockedResolveDeanScope = jest.mocked(resolveDeanScope);

describe('CampusEventsService Dean event approval scope', () => {
  const tenantId = 'tenant-a';
  const deanA = 'dean-a';
  const schoolAEvent = 'event-school-a';
  const schoolBEvent = 'event-school-b';

  let query: jest.Mock;
  let service: CampusEventsService;

  beforeEach(() => {
    query = jest.fn();
    mockedResolveDeanScope.mockReset();
    mockedResolveDeanScope.mockResolvedValue({
      schoolIds: [101],
      departmentIds: [1001],
      schools: [
        { school_id: 101, school_name: 'School A', school_code: 'SCHOOL_A' },
      ],
    });
    service = new CampusEventsService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  function isScopedOwnershipQuery(sql: string) {
    return (
      sql.includes('s.school_id = ANY($3::int[])') &&
      sql.includes('JOIN departments d ON d.dept_id = fa.dept_id')
    );
  }

  function isDecisionUpdate(sql: string) {
    return (
      sql.includes('UPDATE campus_events') &&
      (sql.includes("dean_approval = 'APPROVED'") ||
        sql.includes("dean_approval = 'REJECTED'"))
    );
  }

  it('lists only events resolved to Dean A school scope', async () => {
    const events = [{ event_id: schoolAEvent }];
    query.mockResolvedValue(events);

    await expect(
      service.listPendingDeanApprovals(tenantId, deanA, ['Dean']),
    ).resolves.toEqual(events);

    expect(mockedResolveDeanScope).toHaveBeenCalledWith(
      expect.anything(),
      deanA,
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('s.school_id = ANY($2::int[])');
    expect(sql).not.toContain('s.dean_user_id');
    expect(params).toEqual([tenantId, [101]]);
  });

  it.each(['approveDeanEvent', 'rejectDeanEvent'] as const)(
    'does not let Dean A %s a School B event through a direct ID',
    async (method) => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT event_id FROM campus_events')) {
          return [{ event_id: schoolBEvent }];
        }
        if (isScopedOwnershipQuery(sql)) return [];
        return [];
      });

      const call =
        method === 'approveDeanEvent'
          ? service.approveDeanEvent(tenantId, deanA, ['Dean'], schoolBEvent)
          : service.rejectDeanEvent(
              tenantId,
              deanA,
              ['Dean'],
              schoolBEvent,
              'Outside school scope',
            );

      await expect(call).rejects.toBeInstanceOf(ForbiddenException);
      expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(
        false,
      );
    },
  );

  it('fails closed when an event has no resolvable advisor, department, and school ownership', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT event_id FROM campus_events')) {
        return [{ event_id: schoolBEvent }];
      }
      if (isScopedOwnershipQuery(sql)) return [];
      return [];
    });

    await expect(
      service.approveDeanEvent(tenantId, deanA, ['Dean'], schoolBEvent),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(
      false,
    );
  });

  it('allows Dean A to approve a School A event', async () => {
    const current = {
      event_id: schoolAEvent,
      status: 'PENDING_DEAN',
      funds_needed: 0,
      advisor_approval: 'APPROVED',
      hod_approval: 'APPROVED',
      dean_approval: 'APPROVED',
      estate_approval: 'PENDING',
    };
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT event_id FROM campus_events')) {
        return [{ event_id: schoolAEvent }];
      }
      if (isScopedOwnershipQuery(sql)) return [{ event_id: schoolAEvent }];
      if (sql.includes('SELECT * FROM campus_events')) return [current];
      if (isDecisionUpdate(sql)) return [current];
      return [];
    });

    await expect(
      service.approveDeanEvent(tenantId, deanA, ['Dean'], schoolAEvent),
    ).resolves.toEqual(current);

    expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(true);
  });

  it('keeps Super Admin tenant-wide pending-event access intact', async () => {
    const events = [{ event_id: schoolBEvent }];
    query.mockResolvedValue(events);

    await expect(
      service.listPendingDeanApprovals(tenantId, 'super-admin', ['SuperAdmin']),
    ).resolves.toEqual(events);

    expect(mockedResolveDeanScope).not.toHaveBeenCalled();
    expect(query.mock.calls[0][1]).toEqual([tenantId]);
  });
});
