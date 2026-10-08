import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
import {
  CampusScopeService,
  type ScopedAuthUser,
} from '../../common/campus-scope/campus-scope.service';

const TICKET_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET_REF_RE = /^TKT-/i;

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

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
    private readonly campusScope: CampusScopeService,
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
    actor?: ScopedAuthUser,
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
    await this.assertTicketCampus(actor, t.student_user_id);
    return this.finalizeTicketRead(t, actorUserId, actorRole, tenantId);
  }

  /** Get a single ticket by ID with access checks for requesters and assignees. */
  async getTicketById(
    ticketId: string,
    actorUserId: string,
    actorRole: string,
    tenantId: string,
    actor?: ScopedAuthUser,
  ) {
    const trimmed = ticketId.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
      throw new NotFoundException('Ticket not found');
    }
    if (TICKET_REF_RE.test(trimmed)) {
      return this.getTicketByRef(
        trimmed,
        actorUserId,
        actorRole,
        tenantId,
        actor,
      );
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
    await this.assertTicketCampus(actor, t.student_user_id);
    return this.finalizeTicketRead(t, actorUserId, actorRole, tenantId);
  }

  private async assertTicketCampus(
    actor: ScopedAuthUser | undefined,
    studentUserId: unknown,
  ) {
    await this.campusScope.assertActorCampusAccess(
      actor,
      await this.campusScope.campusIdForUserDept(String(studentUserId ?? '')),
    );
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
      'cfo',
      'apmanager',
      'apclerk',
      'financecontroller',
      'campusadmin',
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

  /** List FINANCE category helpdesk tickets for the finance desk. */
  async listFinanceGrievances(tenantId: string, actor?: ScopedAuthUser) {
    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds && !campusIds.length) return [];
    const campusJoin = campusIds
      ? `JOIN departments d ON d.dept_id = u.dept_id AND d.deleted_at IS NULL
         JOIN schools s ON s.school_id = d.school_id AND s.deleted_at IS NULL`
      : '';
    const campusWhere = campusIds ? `AND s.campus_id = ANY($2::int[])` : '';
    const params = campusIds ? [tenantId, campusIds] : [tenantId];
    return this.dataSource.query(
      `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.description,
              t.status, t.escalation_level, t.created_at, t.sla_deadline, t.resolved_at,
              t.rejection_reason,
              t.student_user_id,
              u.name AS raised_by_name, u.official_email AS raised_by_email,
              COALESCE(r.role_name, 'Staff') AS raised_by_role,
              au.name AS assigned_to_name,
              t.conversation
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
       ${campusJoin}
       WHERE t.category = 'FINANCE'
         AND COALESCE(t.tenant_id, u.tenant_id) = $1
         AND t.deleted_at IS NULL
         AND t.status IN ('PENDING', 'IN_PROGRESS')
         ${campusWhere}
       ORDER BY t.created_at DESC`,
      params,
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
      `SELECT dept_id
       FROM departments
       WHERE hod_user_id = $1
       UNION
       SELECT dept_id
       FROM users
       WHERE user_id = $1
         AND dept_id IS NOT NULL`,
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
    actor?: ScopedAuthUser,
  ) {
    const actorRoles = new Set(
      [...(actor?.roles ?? []), actor?.role ?? '']
        .map((role) => String(role).trim().toLowerCase())
        .filter(Boolean),
    );
    // A HOD without a resolved department must never fall back to the
    // unrestricted queue. This also protects direct service callers that do
    // not go through the controller's department resolver.
    if (actorRoles.has('hod') && !deptIds?.length) return [];

    const campusIds = actor
      ? await this.campusScope.resolveCampusIds(actor)
      : null;
    if (campusIds && !campusIds.length) return [];
    let scopedDeptIds = deptIds;
    if (campusIds) {
      const campusDeptIds =
        await this.campusScope.departmentIdsForCampuses(campusIds);
      if (!campusDeptIds.length) return [];
      scopedDeptIds = scopedDeptIds?.length
        ? scopedDeptIds.filter((id) => campusDeptIds.includes(id))
        : campusDeptIds;
      if (!scopedDeptIds.length) return [];
    }

    const qb = this.tickets
      .createQueryBuilder('t')
      .innerJoin('users', 'u', 'u.user_id = t.student_user_id')
      .where('t.status = :status', { status: 'PENDING' })
      .andWhere('COALESCE(t.tenant_id, u.tenant_id) = :tenantId', { tenantId })
      .andWhere('t.deleted_at IS NULL')
      .andWhere(
        `(t.category = 'STUDENT_PROFILE' OR (t.category = 'ACADEMICS' AND t.subject ILIKE :profileHint))`,
        { profileHint: '%profile%' },
      );

    if (scopedDeptIds?.length) {
      qb.andWhere('u.dept_id IN (:...deptIds)', { deptIds: scopedDeptIds });
    }

    return qb.orderBy('t.created_at', 'DESC').take(limit).getMany();
  }

  async updateStatus(
    ticketId: string,
    dto: UpdateTicketStatusDto,
    actor?: {
      userId: string;
      role: string;
      tenantId: string;
      roles?: string[];
    },
  ) {
    if (!TICKET_UUID_RE.test(ticketId) && !TICKET_REF_RE.test(ticketId)) {
      throw new BadRequestException('Invalid ticket ID');
    }
    if (
      !['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].includes(dto?.status)
    ) {
      throw new BadRequestException('Invalid ticket status');
    }
    if (dto.status === 'REJECTED' && !dto.rejection_reason?.trim()) {
      throw new BadRequestException(
        'rejection_reason is required when rejecting a ticket',
      );
    }

    let saved: HelpdeskTicket;
    let changed = false;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(HelpdeskTicket);
        const ticket = await repository.findOne({
          where: TICKET_UUID_RE.test(ticketId)
            ? { ticket_id: ticketId }
            : { ticket_ref: ticketId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        if (actor?.tenantId) {
          const [owner] = await manager.query<{ tenant_id: string }[]>(
            `SELECT tenant_id FROM users WHERE user_id = $1 LIMIT 1`,
            [ticket.student_user_id],
          );
          if (!owner || owner.tenant_id !== actor.tenantId) {
            throw new ForbiddenException('Ticket is outside your tenant scope');
          }
        }
        if (actor) {
          await this.assertTicketCampus(
            {
              user_id: actor.userId,
              role: actor.role,
              roles: actor.roles,
              tenant_id: actor.tenantId,
            },
            ticket.student_user_id,
          );
          await this.assertTicketActorScope(ticket, actor);
        }

        if (ticket.status !== 'PENDING' && ticket.status !== 'IN_PROGRESS') {
          // Retrying the same decision must not reopen/extend the unlock window.
          if (
            ticket.status === dto.status &&
            (dto.status !== 'REJECTED' ||
              ticket.rejection_reason === dto.rejection_reason?.trim()) &&
            (dto.assigned_to_user_id === undefined ||
              ticket.assigned_to_user_id === dto.assigned_to_user_id)
          )
            return ticket;
          throw new ConflictException(
            'Ticket has already been decided. Refresh the queue.',
          );
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

        if (actor?.userId) ticket.resolved_by = actor.userId;

        const result = await repository.save(ticket);
        if (
          dto.status === 'RESOLVED' &&
          this.isProfileCorrectionTicket(ticket)
        ) {
          const unlocked = await manager.query(
            `UPDATE student_profiles
         SET profile_unlocked_until = NOW() + INTERVAL '15 minutes'
         WHERE user_id = $1
           AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
         RETURNING user_id`,
            [
              ticket.student_user_id,
              ticket.tenant_id ?? actor?.tenantId ?? null,
            ],
          );
          if (!unlocked.length) {
            throw new BadRequestException(
              'Student profile is missing; approval was not committed',
            );
          }
        }
        changed = true;
        return result;
      });
    } catch (error) {
      const code = databaseErrorCode(error);
      if (code === '23514') {
        throw new BadRequestException(
          'This helpdesk status is not enabled in the database. Run the helpdesk status migration and retry.',
        );
      }
      if (code === '23505') {
        throw new ConflictException(
          'This helpdesk ticket was updated by another operator. Refresh and retry.',
        );
      }
      if (code === '42703' || code === '42P01') {
        throw new BadRequestException(
          'Helpdesk storage is not migrated. Apply the latest migrations and retry.',
        );
      }
      throw error;
    }

    // Notifications are best effort after commit. The unlock is not optional:
    // it commits atomically with the approval above.
    try {
      if (changed && dto.status === 'REJECTED') {
        const student = await this.users.findOne({
          where: { user_id: saved.student_user_id },
        });
        const tenantId =
          student?.tenant_id ??
          saved.tenant_id ??
          'a0000000-0000-4000-8000-000000000001';
        await this.notify.ticketReply({
          tenantId,
          userId: saved.student_user_id,
          ticketId: saved.ticket_id,
          subject: saved.subject,
          title: 'Helpdesk request rejected',
          message: dto.rejection_reason!.trim(),
          actionLink: '/student/helpdesk',
        });
      }
    } catch (error) {
      this.logger.warn(
        `Helpdesk post-status side effect failed for ${saved.ticket_id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return saved;
  }

    const isProfileCorrection =
      ticket.category === 'STUDENT_PROFILE' ||
      (ticket.category === 'ACADEMICS' && /profile/i.test(ticket.subject));

    if (dto.status === 'RESOLVED' && isProfileCorrection) {
      await this.dataSource.query(
        `UPDATE student_profiles
         SET profile_unlocked_until = NOW() + INTERVAL '15 minutes'
         WHERE user_id = $1`,
        [ticket.student_user_id],
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
      // HOD mappings are deployed in two compatible forms: a canonical
      // departments.hod_user_id link, or the user's own dept_id. Resolve the
      // same union used by the queue so a listed request can be approved.
      const deptIds = await this.resolveHodDepartmentIds(actor.userId);
      if (
        student.dept_id == null ||
        !deptIds.includes(Number(student.dept_id))
      ) {
        throw new ForbiddenException('Ticket is outside your department scope');
      }
    }
  }

  private isProfileCorrectionTicket(
    ticket: Pick<HelpdeskTicket, 'category' | 'subject'>,
  ) {
    return (
      ticket.category === 'STUDENT_PROFILE' ||
      (ticket.category === 'ACADEMICS' &&
        /profile/i.test(String(ticket.subject ?? '')))
    );
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
