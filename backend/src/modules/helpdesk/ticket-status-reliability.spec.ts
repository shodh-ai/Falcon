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
    (dataSource as any).transaction = jest.fn(async (callback: (manager: any) => unknown) =>
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
    users.findOne.mockRejectedValueOnce(new Error('notification dependency down'));

    const saved = await service.updateStatus(
      ticket.ticket_id,
      { status: 'REJECTED', rejection_reason: 'The submitted value is not supported.' },
      { userId: 'admin-1', role: 'CampusAdmin', tenantId: 'tenant-1' },
    );

    expect(saved.status).toBe('REJECTED');
    expect(saved.rejection_reason).toBe('The submitted value is not supported.');
    expect(dataSource.query).toHaveBeenCalled();
  });

  it('does not leave an approval committed when the profile-unlock write is unavailable', async () => {
    const { service, ticket, dataSource } = makeService();
    dataSource.query
      .mockResolvedValueOnce([{ tenant_id: 'tenant-1' }])
      .mockRejectedValueOnce(new Error('student profile table unavailable'));

    await expect(service.updateStatus(
      ticket.ticket_id,
      { status: 'RESOLVED' },
      { userId: 'admin-1', role: 'CampusAdmin', tenantId: 'tenant-1' },
    )).rejects.toThrow('student profile table unavailable');
  });
});
