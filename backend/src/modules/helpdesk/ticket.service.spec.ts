import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketService } from './ticket.service';

describe('TicketService campus admin workflow', () => {
  const ticketProvider = {
    listMyTickets: jest.fn(),
    listTicketsForAssignee: jest.fn(),
  };
  const tickets = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    manager: { query: jest.fn() },
  };
  const dataSource = { query: jest.fn() };
  const notify = { ticketReply: jest.fn() };
  const workflowRouting = { getHelpdeskAssignee: jest.fn() };
  const workflowNotify = { notifyApprover: jest.fn() };
  const users = { findOne: jest.fn() };
  const campusScope = {
    assertActorCampusAccess: jest.fn(),
    resolveCampusIds: jest.fn(),
    campusIdForUserDept: jest.fn(),
  };

  let service: TicketService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TicketService(
      ticketProvider as never,
      tickets as never,
      dataSource as never,
      notify as never,
      workflowRouting as never,
      workflowNotify as never,
      users as never,
      campusScope as never,
    );
  });

  it('allows Campus Admin to reply on a campus-scoped ticket', async () => {
    const ticket = {
      ticket_id: 'ticket-1',
      student_user_id: 'student-1',
      category: 'IT',
      subject: 'Wi-Fi issue',
      conversation: [],
    };
    tickets.findOne.mockResolvedValue(ticket);
    tickets.save.mockImplementation(async (value) => value);
    tickets.manager.query.mockResolvedValue([{ tenant_id: 'tenant-1' }]);
    campusScope.assertActorCampusAccess.mockResolvedValue(undefined);

    const saved = await service.addMessage(
      'ticket-1',
      'campus-admin-1',
      'CampusAdmin',
      'We are checking this now.',
      {
        user_id: 'campus-admin-1',
        role: 'CampusAdmin',
        tenant_id: 'tenant-1',
      },
    );

    expect(campusScope.assertActorCampusAccess).toHaveBeenCalled();
    expect(saved.conversation).toHaveLength(1);
    expect(saved.conversation?.[0]?.message).toBe('We are checking this now.');
  });

  it('blocks Campus Admin reply when campus scope fails', async () => {
    tickets.findOne.mockResolvedValue({
      ticket_id: 'ticket-1',
      student_user_id: 'student-1',
      category: 'IT',
      conversation: [],
    });
    campusScope.assertActorCampusAccess.mockRejectedValue(
      new ForbiddenException('Ticket is outside your assigned campus scope'),
    );

    await expect(
      service.addMessage(
        'ticket-1',
        'campus-admin-1',
        'CampusAdmin',
        'Hello',
        {
          user_id: 'campus-admin-1',
          role: 'CampusAdmin',
          tenant_id: 'tenant-1',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid assignee for Campus Admin status update', async () => {
    tickets.findOne.mockResolvedValue({
      ticket_id: 'ticket-1',
      student_user_id: 'student-1',
      status: 'PENDING',
      category: 'IT',
    });
    campusScope.assertActorCampusAccess.mockResolvedValue(undefined);
    campusScope.resolveCampusIds.mockResolvedValue([1]);
    dataSource.query.mockResolvedValue([]);

    await expect(
      service.updateStatus(
        'ticket-1',
        { status: 'IN_PROGRESS', assigned_to_user_id: 'outside-user' },
        {
          userId: 'campus-admin-1',
          role: 'CampusAdmin',
          tenantId: 'tenant-1',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when ticket is missing on detail lookup', async () => {
    tickets.manager.query.mockResolvedValue([]);
    await expect(
      service.getTicketById(
        '00000000-0000-4000-8000-000000000099',
        'campus-admin-1',
        'CampusAdmin',
        'tenant-1',
        {
          user_id: 'campus-admin-1',
          role: 'CampusAdmin',
          tenant_id: 'tenant-1',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
