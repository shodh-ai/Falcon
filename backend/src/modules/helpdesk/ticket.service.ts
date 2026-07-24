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

    const policyRows = await this.dataSource.query<
      Array<{ resolve_mins: number; first_response_mins: number }>
    >(
      `SELECT resolve_mins, first_response_mins
       FROM helpdesk_sla_policies
       WHERE tenant_id = $1 AND category = $2 AND priority = 'NORMAL'
       LIMIT 1`,
      [tenantId, dto.category],
    );
    const resolveMins = Number(policyRows[0]?.resolve_mins ?? 1440);
    const slaDeadline = new Date(Date.now() + resolveMins * 60 * 1000);

    const queueRows = await this.dataSource.query<
      Array<{ queue_id: string; assignee_role: string }>
    >(
      `SELECT queue_id, assignee_role FROM helpdesk_queues
       WHERE tenant_id = $1 AND category = $2
       LIMIT 1`,
      [tenantId, dto.category],
    );
    const queue = queueRows[0];

    let finalAssignee = assignee;
    if (queue?.assignee_role && !dto.assigned_to_user_id) {
      const roleUser = await this.dataSource.query<
        Array<{ user_id: string; name: string; official_email: string }>
      >(
        `SELECT u.user_id, u.name, u.official_email
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND u.is_active = true
           AND lower(r.role_name) = lower($2)
         LIMIT 1`,
        [tenantId, queue.assignee_role],
      );
      if (roleUser[0]) {
        finalAssignee = {
          userId: roleUser[0].user_id,
          name: roleUser[0].name,
          email: roleUser[0].official_email ?? '',
          routeReason: `QUEUE_${queue.assignee_role}`,
        };
      }
    }

    const ticket = await this.tickets.save(
      this.tickets.create({
        student_user_id: studentUserId,
        ...ticketFields,
        assigned_to_user_id: finalAssignee.userId,
        status: 'PENDING',
        tenant_id: tenantId,
        ticket_ref: ticketRef,
        sla_deadline: slaDeadline,
      } as Partial<HelpdeskTicket>),
    );

    if (queue?.queue_id) {
      await this.dataSource.query(
        `UPDATE helpdesk_tickets SET queue_id = $2 WHERE ticket_id = $1`,
        [ticket.ticket_id, queue.queue_id],
      );
    }

    try {
      await this.dataSource.query(
        `INSERT INTO helpdesk_ticket_events (ticket_id, event_type, actor_user_id, payload)
         VALUES ($1, 'CREATED', $2, $3::jsonb)`,
        [
          ticket.ticket_id,
          studentUserId,
          JSON.stringify({
            category: dto.category,
            resolve_mins: resolveMins,
            queue_id: queue?.queue_id ?? null,
          }),
        ],
      );
    } catch {
      // Event ledger is best-effort; ticket create must not fail if ledger lags.
    }

    const actionLink =
      dto.category === 'HR'
        ? `/hr/grievances/${ticket.ticket_id}`
        : dto.category === 'FACILITIES'
          ? `/operations/esm`
          : `/helpdesk/tickets/${ticket.ticket_id}`;

    this.workflowNotify.notifyApprover({
      tenantId,
      approver: finalAssignee,
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
              t.escalation_level,
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
    return this.finalizeTicketRead(t, actorUserId, actorRole, tenantId);
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
              t.sla_deadline, t.resolved_at, t.rejection_reason, t.escalation_level,
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
    return this.finalizeTicketRead(t, actorUserId, actorRole, tenantId);
  }

  private async finalizeTicketRead(
    t: Record<string, unknown>,
    actorUserId: string,
    actorRole: string,
    tenantId: string,
  ) {
    const role = actorRole.trim().toLowerCase();
    const isOwner = t.student_user_id === actorUserId;
    const isAssignee = t.assigned_to_user_id === actorUserId;

    if (['student', 'applicant'].includes(role) && !isOwner) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    if (isOwner || isAssignee) {
      return t;
    }
    if (['dean', 'hod'].includes(role)) {
      await this.assertTicketActorScope(
        {
          student_user_id: t.student_user_id,
          category: t.category,
          escalation_level: Number(t.escalation_level ?? 0),
        } as HelpdeskTicket,
        { userId: actorUserId, role: actorRole, tenantId },
      );
      return t;
    }

    const isAdmin = [
      'superadmin',
      'registrar',
      'accountant',
      'warden',
      'faculty',
      'chairman',
      'president',
      'hr',
      'hradmin',
    ].includes(role);

    if (!isAdmin) {
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
    return rows
      .map((r) => Number(r.dept_id))
      .filter((id) => Number.isFinite(id));
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

  async updateStatus(
    ticketId: string,
    dto: UpdateTicketStatusDto,
    actor?: { userId: string; role: string; tenantId: string },
  ) {
    if (dto.status === 'REJECTED' && !dto.rejection_reason?.trim()) {
      throw new BadRequestException(
        'rejection_reason is required when rejecting a ticket',
      );
    }

    const ticket = await this.tickets.findOne({
      where: { ticket_id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (actor) {
      await this.assertTicketActorScope(ticket, actor);
    }

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

  private async assertTicketActorScope(
    ticket: HelpdeskTicket,
    actor: { userId: string; role: string; tenantId: string },
  ) {
    const role = actor.role.trim().toLowerCase();
    if (!['dean', 'hod'].includes(role)) return;

    const [student] = await this.dataSource.query<
      Array<{ dept_id: number | null; tenant_id: string }>
    >(`SELECT dept_id, tenant_id FROM users WHERE user_id = $1 LIMIT 1`, [
      ticket.student_user_id,
    ]);
    if (!student || student.tenant_id !== actor.tenantId) {
      throw new ForbiddenException('Ticket is outside your tenant scope');
    }

    if (role === 'dean') {
      if (
        ticket.category === 'ACADEMICS' &&
        (ticket.escalation_level ?? 0) < 1
      ) {
        throw new ForbiddenException(
          'Only escalated academic grievances can be updated by Dean',
        );
      }
      const deptRows = await this.dataSource.query<Array<{ dept_id: number }>>(
        `SELECT DISTINCT dept_id
         FROM (
           SELECT p.dept_id
           FROM iam_programs p
           INNER JOIN schools s ON s.school_id = p.school_id
           WHERE p.deleted_at IS NULL AND p.dept_id IS NOT NULL
             AND (s.dean_user_id = $1 OR EXISTS (
               SELECT 1 FROM departments hd WHERE hd.hod_user_id = $1 AND hd.school_id = s.school_id
             ))
           UNION SELECT dept_id FROM departments WHERE hod_user_id = $1
           UNION SELECT dept_id FROM users WHERE user_id = $1 AND dept_id IS NOT NULL
         ) scoped WHERE dept_id IS NOT NULL`,
        [actor.userId],
      );
      const deptIds = deptRows.map((row) => Number(row.dept_id));
      if (
        student.dept_id == null ||
        !deptIds.includes(Number(student.dept_id))
      ) {
        throw new ForbiddenException('Ticket is outside your school scope');
      }
      return;
    }

    if (role === 'hod') {
      const deptRows = await this.dataSource.query<Array<{ dept_id: number }>>(
        `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
        [actor.userId],
      );
      const deptIds = deptRows.map((row) => Number(row.dept_id));
      if (
        student.dept_id == null ||
        !deptIds.includes(Number(student.dept_id))
      ) {
        throw new ForbiddenException('Ticket is outside your department scope');
      }
    }
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
    actorRole: string,
    tenantId: string,
  ) {
    const ticket = await this.tickets.findOne({
      where: { ticket_id: ticketId, tenant_id: tenantId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    await this.assertTicketActorScope(ticket, {
      userId: actorUserId,
      role: actorRole,
      tenantId,
    });

    const newLevel = Math.min(Number(ticket.escalation_level ?? 0) + 1, 3);
    ticket.escalation_level = newLevel;
    return this.tickets.save(ticket);
  }
}
