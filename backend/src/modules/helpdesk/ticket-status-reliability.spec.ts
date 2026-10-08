import { TicketService } from './ticket.service';

describe('TicketService status reliability', () => {
  function makeService(overrides: Record<string, unknown> = {}) {
    const ticket = {
      ticket_id: '11111111-1111-4111-8111-111111111111',
      student_user_id: '22222222-2222-4222-8222-222222222222',
      tenant_id: 'tenant-1',
      category: 'STUDENT_PROFILE',
      subject: 'Correct name',
      status: 'PENDING',
      rejection_reason: null,
      resolved_at: null,
      resolved_by: null,
      ...(overrides.ticket as Record<string, unknown> | undefined),
    } as any;
    const tickets = {
      findOne: jest.fn().mockResolvedValue(ticket),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ tenant_id: 'tenant-1' }]),
    };
    (dataSource as any).transaction = jest.fn(
      async (callback: (manager: any) => unknown) =>
        callback({
          getRepository: () => tickets,
          query: (...args: unknown[]) => dataSource.query(...args),
        }),
    );
    const users = {
      findOne: jest.fn().mockResolvedValue({ tenant_id: 'tenant-1' }),
    };
    const campusScope = {
      campusIdForUserDept: jest.fn().mockResolvedValue(null),
      assertActorCampusAccess: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TicketService(
      {} as any,
      tickets as any,
      dataSource as any,
      { ticketReply: jest.fn() } as any,
      {} as any,
      {} as any,
      users as any,
      campusScope as any,
    );
    return { service, ticket, tickets, dataSource, users };
  }

  it('commits a rejection even when the notification side effect fails', async () => {
    const { service, ticket, dataSource, users } = makeService();
    users.findOne.mockRejectedValueOnce(
      new Error('notification dependency down'),
    );

    const saved = await service.updateStatus(
      ticket.ticket_id,
      {
        status: 'REJECTED',
        rejection_reason: 'The submitted value is not supported.',
      },
      { userId: 'admin-1', role: 'CampusAdmin', tenantId: 'tenant-1' },
    );

    expect(saved.status).toBe('REJECTED');
    expect(saved.rejection_reason).toBe(
      'The submitted value is not supported.',
    );
    expect(dataSource.query).toHaveBeenCalled();
  });

  it('does not leave an approval committed when the profile-unlock write is unavailable', async () => {
    const { service, ticket, dataSource } = makeService();
    dataSource.query
      .mockResolvedValueOnce([{ tenant_id: 'tenant-1' }])
      .mockRejectedValueOnce(new Error('student profile table unavailable'));

    await expect(
      service.updateStatus(
        ticket.ticket_id,
        { status: 'RESOLVED' },
        { userId: 'admin-1', role: 'CampusAdmin', tenantId: 'tenant-1' },
      ),
    ).rejects.toThrow('student profile table unavailable');
  });

  it('allows an HOD mapped only through users.dept_id to approve an in-department correction', async () => {
    const { service, ticket, dataSource } = makeService();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT tenant_id FROM users')) {
        return [{ tenant_id: 'tenant-1' }];
      }
      if (sql.includes('SELECT dept_id, tenant_id FROM users')) {
        return [{ dept_id: 17, tenant_id: 'tenant-1' }];
      }
      if (sql.includes('SELECT dept_id') && sql.includes('departments')) {
        return [{ dept_id: 17 }];
      }
      if (sql.includes('UPDATE student_profiles')) {
        return [{ user_id: ticket.student_user_id }];
      }
      return [];
    });

    const saved = await service.updateStatus(
      ticket.ticket_id,
      { status: 'RESOLVED' },
      { userId: 'hod-1', role: 'HOD', tenantId: 'tenant-1' },
    );

    expect(saved.status).toBe('RESOLVED');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM users'),
      [ticket.student_user_id],
    );
  });

  it('opens the edit window for legacy ACADEMICS profile-correction tickets', async () => {
    const { service, ticket, dataSource } = makeService({
      ticket: { category: 'ACADEMICS', subject: 'Student profile correction' },
    });
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT tenant_id FROM users')) {
        return [{ tenant_id: 'tenant-1' }];
      }
      if (sql.includes('UPDATE student_profiles')) {
        return [{ user_id: ticket.student_user_id }];
      }
      return [];
    });

    const saved = await service.updateStatus(
      ticket.ticket_id,
      { status: 'RESOLVED' },
      { userId: 'admin-1', role: 'CampusAdmin', tenantId: 'tenant-1' },
    );

    expect(saved.status).toBe('RESOLVED');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_profiles'),
      expect.any(Array),
    );
  });

  it('rejects an HOD approval when the student is outside the HOD department', async () => {
    const { service, ticket, dataSource, tickets } = makeService();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT tenant_id FROM users')) {
        return [{ tenant_id: 'tenant-1' }];
      }
      if (sql.includes('SELECT dept_id, tenant_id FROM users')) {
        return [{ dept_id: 99, tenant_id: 'tenant-1' }];
      }
      if (sql.includes('SELECT dept_id') && sql.includes('departments')) {
        return [{ dept_id: 17 }];
      }
      return [];
    });

    await expect(
      service.updateStatus(
        ticket.ticket_id,
        { status: 'RESOLVED' },
        { userId: 'hod-1', role: 'HOD', tenantId: 'tenant-1' },
      ),
    ).rejects.toThrow('department scope');
    expect(tickets.save).not.toHaveBeenCalled();
  });

  it('does not fall back to an unrestricted queue for an unmapped HOD', async () => {
    const { service, dataSource } = makeService();

    await expect(
      service.listProfileCorrectionTickets('tenant-1', 100, undefined, {
        user_id: 'hod-without-department',
        role: 'HOD',
        tenant_id: 'tenant-1',
      }),
    ).resolves.toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
