import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HelpdeskTicket } from '../../entities/helpdesk-ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import {
  TICKET_PROVIDER,
  type ITicketProvider,
} from './providers/ticket-provider.interface';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import {
  WorkflowRoutingService,
  type RoutedApprover,
} from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
import { User } from '../../entities/user.entity';
import { assertNoPendingRow } from '../../common/validators/pending-request.util';

const TICKET_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET_REF_RE = /^TKT-/i;

@Injectable()
export class TicketService {
  constructor(
    @Inject(TICKET_PROVIDER)
    private readonly ticketProvider: ITicketProvider,
    @InjectRepository(HelpdeskTicket)
    private tickets: Repository<HelpdeskTicket>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async createTicket(studentUserId: string, dto: CreateTicketDto) {
    const student = await this.users.findOne({
      where: { user_id: studentUserId },
    });
    const tenantId =
      student?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    if (dto.category !== 'MENTORSHIP') {
      await assertNoPendingRow(this.tickets, {
        student_user_id: studentUserId,
        category: dto.category,
        status: 'PENDING',
      });
    }

    const assignee: RoutedApprover = dto.assigned_to_user_id
      ? {
          userId: dto.assigned_to_user_id,
          name: 'Mentor',
          email: '',
          routeReason: 'MENTORSHIP_DIRECT',
        }
      : await this.workflowRouting.getHelpdeskAssignee(
          studentUserId,
          tenantId,
          dto.category,
        );

    const { assigned_to_user_id: _omit, ...ticketFields } = dto;

    const ticketRef = await this.nextTicketRef();

    const ticket = await this.tickets.save(
      this.tickets.create({
        student_user_id: studentUserId,
        ...ticketFields,
        assigned_to_user_id: assignee.userId,
        status: 'PENDING',
        tenant_id: tenantId,
        ticket_ref: ticketRef,
        sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as Partial<HelpdeskTicket>),
    );

    const actionLink =
      dto.category === 'HR'
        ? `/hr/grievances/${ticket.ticket_id}`
        : dto.category === 'FACILITIES'
          ? `/hr/grievances/${ticket.ticket_id}`
          : `/helpdesk/tickets/${ticket.ticket_id}`;

    this.workflowNotify.notifyApprover({
      tenantId,
      approver: assignee,
      title: `Helpdesk: ${dto.subject}`,
      message: `${student?.name ?? 'Student'} opened a ${dto.category} ticket.`,
      actionLink,
      category: 'HELPDESK',
      requesterName: student?.name,
    });

    return ticket;
  }

  private async nextTicketRef(): Promise<string> {
    const rows = await this.tickets.manager.query<Array<{ n: string }>>(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_ref FROM 5) AS INT)), 0) + 1 AS n
       FROM helpdesk_tickets
       WHERE ticket_ref ~ '^TKT-[0-9]+$'`,
    );
    const seq = Number(rows[0]?.n ?? 1);
    return `TKT-${String(seq).padStart(4, '0')}`;
  }

  async getTicketByRef(
    ticketRef: string,
    actorUserId: string,
    actorRole: string,
    tenantId: string,
  ) {
    const rows = await this.tickets.manager.query<
      Array<Record<string, unknown>>
    >(
      `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.description, t.status,
              t.student_user_id, t.assigned_to_user_id, t.conversation, t.created_at,
              su.name AS student_name, au.name AS assigned_to_name
       FROM helpdesk_tickets t
       JOIN users su ON su.user_id = t.student_user_id
       LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
       WHERE UPPER(t.ticket_ref) = UPPER($1)
         AND COALESCE(t.tenant_id, su.tenant_id) = $2
       LIMIT 1`,
      [ticketRef, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Ticket not found');

    const t = rows[0];
    const role = actorRole.trim().toLowerCase();
    const isOwner = t.student_user_id === actorUserId;
    const isAssignee = t.assigned_to_user_id === actorUserId;
    const isAdmin = [
      'superadmin',
      'registrar',
      'accountant',
      'warden',
      'hod',
      'dean',
      'faculty',
      'chairman',
      'president',
      'hr',
      'hradmin',
    ].includes(role);

    if (['student', 'applicant'].includes(role) && !isOwner) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    if (!isOwner && !isAssignee && !isAdmin) {
      throw new ForbiddenException('You are not allowed to view this ticket');
    }

    return t;
  }

  /** Get a single ticket by ID with access checks for requesters and assignees. */
  async getTicketById(
    ticketId: string,
    actorUserId: string,
    actorRole: string,
    tenantId: string,
  ) {
    const trimmed = ticketId.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
      throw new NotFoundException('Ticket not found');
    }
    if (TICKET_REF_RE.test(trimmed)) {
      return this.getTicketByRef(trimmed, actorUserId, actorRole, tenantId);
    }
    if (!TICKET_UUID_RE.test(trimmed)) {
      throw new NotFoundException('Ticket not found');
    }

    const rows = await this.tickets.manager.query<
      Array<Record<string, unknown>>
    >(
      `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.description, t.status,
              t.student_user_id, t.assigned_to_user_id, t.conversation, t.created_at,
              t.sla_deadline, t.resolved_at, t.rejection_reason,
              su.name AS student_name, au.name AS assigned_to_name
       FROM helpdesk_tickets t
       JOIN users su ON su.user_id = t.student_user_id
       LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
       WHERE t.ticket_id = $1::uuid
         AND COALESCE(t.tenant_id, su.tenant_id) = $2
         AND t.deleted_at IS NULL
       LIMIT 1`,
      [trimmed, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Ticket not found');

    const t = rows[0];
    const role = actorRole.trim().toLowerCase();
    const isOwner = t.student_user_id === actorUserId;
    const isAssignee = t.assigned_to_user_id === actorUserId;
    const isAdmin = [
      'superadmin',
      'registrar',
      'accountant',
      'warden',
      'hod',
      'dean',
      'faculty',
      'chairman',
      'president',
      'hr',
      'hradmin',
    ].includes(role);

    if (['student', 'applicant'].includes(role) && !isOwner) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    if (!isOwner && !isAssignee && !isAdmin) {
      throw new ForbiddenException('You are not allowed to view this ticket');
    }

    return t;
  }

  listMyTickets(studentUserId: string) {
    return this.ticketProvider.listMyTickets(studentUserId);
  }

  listTicketsForAssignee(assigneeUserId: string) {
    return this.ticketProvider.listTicketsForAssignee(assigneeUserId);
  }

  /** List all HR / Facilities grievance tickets for a tenant. */
  async listHrGrievances(tenantId: string) {
    return this.dataSource.query(
      `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.description,
              t.status, t.escalation_level, t.created_at, t.sla_deadline, t.resolved_at,
              t.rejection_reason,
              u.name AS raised_by_name, u.official_email AS raised_by_email,
              COALESCE(r.role_name, 'Staff') AS raised_by_role,
              au.name AS assigned_to_name,
              t.conversation
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
       WHERE t.category IN ('HR', 'FACILITIES')
         AND COALESCE(t.tenant_id, u.tenant_id) = $1
         AND t.deleted_at IS NULL
       ORDER BY
         CASE t.status WHEN 'PENDING' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END,
         t.created_at DESC`,
      [tenantId],
    );
  }

  /** Get a single HR grievance ticket by ID for the detail view. */
  async getHrGrievance(ticketId: string, tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.description,
              t.status, t.escalation_level, t.created_at, t.sla_deadline, t.resolved_at,
              t.rejection_reason,
              u.name AS raised_by_name, u.official_email AS raised_by_email,
              COALESCE(r.role_name, 'Staff') AS raised_by_role,
              au.name AS assigned_to_name,
              t.conversation
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
       WHERE t.ticket_id = $1
         AND t.category IN ('HR', 'FACILITIES')
         AND COALESCE(t.tenant_id, u.tenant_id) = $2
         AND t.deleted_at IS NULL
       LIMIT 1`,
      [ticketId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Grievance ticket not found');
    return rows[0];
  }

  async resolveHodDepartmentIds(hodUserId: string): Promise<number[]> {
    const rows = await this.dataSource.query<{ dept_id: number }[]>(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1
       UNION
       SELECT dept_id FROM users WHERE user_id = $1 AND dept_id IS NOT NULL`,
      [hodUserId],
    );
    return rows.map((r) => Number(r.dept_id)).filter((id) => Number.isFinite(id));
  }

  async listProfileCorrectionTickets(
    tenantId: string,
    limit = 20,
    deptIds?: number[],
  ) {
    const qb = this.tickets
      .createQueryBuilder('t')
      .innerJoin('users', 'u', 'u.user_id = t.student_user_id')
      .where('t.status = :status', { status: 'PENDING' })
      .andWhere('u.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `(t.category = 'STUDENT_PROFILE' OR (t.category = 'ACADEMICS' AND t.subject ILIKE :profileHint))`,
        { profileHint: '%profile%' },
      );

    if (deptIds?.length) {
      qb.andWhere('u.dept_id IN (:...deptIds)', { deptIds });
    }

    return qb.orderBy('t.created_at', 'DESC').take(limit).getMany();
  }

  async updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    if (dto.status === 'REJECTED' && !dto.rejection_reason?.trim()) {
      throw new BadRequestException(
        'rejection_reason is required when rejecting a ticket',
      );
    }

    const ticket = await this.tickets.findOne({
      where: { ticket_id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    ticket.status = dto.status;
    if (dto.assigned_to_user_id !== undefined) {
      ticket.assigned_to_user_id = dto.assigned_to_user_id;
    }
    if (dto.status === 'REJECTED') {
      ticket.rejection_reason = dto.rejection_reason!.trim();
      ticket.resolved_at = new Date();
    }
    if (dto.status === 'RESOLVED') {
      ticket.resolved_at = new Date();
      ticket.rejection_reason = null;
    }

    const saved = await this.tickets.save(ticket);

    if (dto.status === 'RESOLVED' && ticket.category === 'STUDENT_PROFILE') {
      await this.dataSource.query(
        `UPDATE student_profiles
         SET profile_unlocked_until = NOW() + INTERVAL '15 minutes'
         WHERE user_id = $1`,
        [ticket.student_user_id],
      );
    }

    if (dto.status === 'REJECTED') {
      const student = await this.users.findOne({
        where: { user_id: ticket.student_user_id },
      });
      const tenantId =
        student?.tenant_id ??
        ticket.tenant_id ??
        'a0000000-0000-4000-8000-000000000001';
      this.notify.ticketReply({
        tenantId,
        userId: ticket.student_user_id,
        ticketId: ticket.ticket_id,
        subject: ticket.subject,
        title: 'Helpdesk request rejected',
        message: dto.rejection_reason!.trim(),
        actionLink: '/student/helpdesk',
      });
    }

    return saved;
  }

  async addMessage(
    ticketId: string,
    actorUserId: string,
    actorRole: string,
    message: string,
  ) {
    const ticket = await this.tickets.findOne({
      where: { ticket_id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isStudentOwner = ticket.student_user_id === actorUserId;
    const isAdminActor = [
      'SuperAdmin',
      'Registrar',
      'Accountant',
      'Warden',
      'HOD',
      'Dean',
      'Faculty',
      'HR',
      'HRAdmin',
    ].includes(actorRole);
    if (!isStudentOwner && !isAdminActor) {
      throw new ForbiddenException(
        'You are not allowed to post messages in this ticket',
      );
    }

    const conversation = ticket.conversation ?? [];
    conversation.push({
      sender_user_id: actorUserId,
      sender_role: actorRole,
      message,
      sent_at: new Date().toISOString(),
    });
    ticket.conversation = conversation;
    const saved = await this.tickets.save(ticket);

    if (isAdminActor && !isStudentOwner && ticket.category !== 'MENTORSHIP') {
      const student = await this.tickets.manager.query<
        Array<{ tenant_id: string }>
      >(`SELECT tenant_id FROM users WHERE user_id = $1 LIMIT 1`, [
        ticket.student_user_id,
      ]);
      const tenantId =
        student[0]?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
      this.notify.ticketReply({
        tenantId,
        userId: ticket.student_user_id,
        ticketId: ticket.ticket_id,
        subject: ticket.subject,
      });
    }

    return saved;
  }

  async escalateTicket(
    ticketId: string,
    actorUserId: string,
    tenantId: string,
  ) {
    const ticket = await this.tickets.findOne({
      where: { ticket_id: ticketId, tenant_id: tenantId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const newLevel = Math.min(Number(ticket.escalation_level ?? 0) + 1, 3);
    ticket.escalation_level = newLevel;
    return this.tickets.save(ticket);
  }
}
