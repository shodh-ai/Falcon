import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

describe('Faculty project funding transaction', () => {
  const args = ['guide-1', 'faculty-1', 'tenant-1', 500, '  Lab supplies  '] as const;

  function setup() {
    const managerQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE OF g')) return [{ guide_id: 'guide-1' }];
      if (sql.includes('INSERT INTO project_funding_requests')) return [{ request_id: 'request-1', amount: 500 }];
      return [];
    });
    const transaction = jest.fn().mockImplementation(async work => work({ query: managerQuery }));
    const query = jest.fn().mockResolvedValue([]);
    const approvalRequired = jest.fn();
    const service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { transaction, query }, notify: { approvalRequired },
    }) as FacultyWorkspacesService;
    return { service, managerQuery, transaction, query, approvalRequired };
  }

  it('locks the active owned project, rechecks pending requests, and inserts within the same transaction', async () => {
    const { service, managerQuery, transaction, query } = setup();
    await expect(service.requestFunding(...args)).resolves.toMatchObject({ request_id: 'request-1' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(managerQuery.mock.calls[0][0]).toContain('FOR UPDATE OF g');
    expect(managerQuery.mock.calls[0][0]).toContain('g.faculty_user_id = $2 AND g.tenant_id = $3');
    expect(managerQuery.mock.calls[0][0]).toContain("g.status = 'ACTIVE'");
    expect(managerQuery.mock.calls[0][0]).toContain('owner.is_active = true');
    expect(managerQuery.mock.calls[0][1]).toEqual(['guide-1', 'faculty-1', 'tenant-1']);
    expect(managerQuery.mock.calls[1][1]).toEqual(['guide-1', 'tenant-1']);
    expect(managerQuery.mock.calls[2][1]).toEqual(['tenant-1', 'guide-1', 'faculty-1', 500, 'Lab supplies']);
    expect(query.mock.calls.some(([sql]) => /INSERT|FOR UPDATE/.test(sql))).toBe(false);
  });

  it('rejects a project that is inactive or outside the current owner and tenant before inserting', async () => {
    const { service, managerQuery, query, approvalRequired } = setup();
    managerQuery.mockResolvedValueOnce([]);
    await expect(service.requestFunding(...args)).rejects.toBeInstanceOf(NotFoundException);
    expect(managerQuery).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(approvalRequired).not.toHaveBeenCalled();
  });

  it.each(['PENDING_HOD', 'APPROVED_HOD'])(
    'does not insert a duplicate while an existing request is %s', async status => {
      const { service, managerQuery, query, approvalRequired } = setup();
      managerQuery.mockResolvedValueOnce([{ guide_id: 'guide-1' }]).mockResolvedValueOnce([{ status }]);
      await expect(service.requestFunding(...args)).rejects.toBeInstanceOf(BadRequestException);
      expect(managerQuery).toHaveBeenCalledTimes(2);
      expect(query).not.toHaveBeenCalled();
      expect(approvalRequired).not.toHaveBeenCalled();
    },
  );

  it('rechecks the pending queue after a competing request releases the project lock', async () => {
    const { service, transaction, managerQuery } = setup();
    let pending = false;
    let tail: Promise<void> = Promise.resolve();
    managerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE OF g')) return [{ guide_id: 'guide-1' }];
      if (sql.includes('SELECT 1 FROM project_funding_requests')) return pending ? [{ status: 'PENDING_HOD' }] : [];
      if (sql.includes('INSERT INTO project_funding_requests')) { pending = true; return [{ request_id: 'request-1' }]; }
      return [];
    });
    transaction.mockImplementation(async work => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await work({ query: managerQuery }); } finally { release(); }
    });

    const results = await Promise.allSettled([service.requestFunding(...args), service.requestFunding(...args)]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(managerQuery.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE OF g'))).toHaveLength(2);
    expect(managerQuery.mock.calls.filter(([sql]) => sql.includes('INSERT INTO project_funding_requests'))).toHaveLength(1);
  });
});
