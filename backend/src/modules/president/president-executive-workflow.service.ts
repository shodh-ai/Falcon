import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import { CertificateAutomationService } from '../certificate-automation/certificate-automation.service';
import { ExecutiveActionService } from '../leadership/executive-action.service';

export type ExecutiveActor = {
  userId: string;
  tenantId: string;
  role?: string;
  ip?: string;
  sessionId?: string;
};

const DESTINATION_INBOX: Record<string, string> = {
  REGISTRAR: '/admin/dashboard',
  DEAN: '/dean/dashboard',
  FINANCE: '/finance/dashboard',
  HR: '/hr/dashboard',
  IQAC: '/iqac/dashboard',
  OPERATIONS: '/admin-ops/dashboard',
};

const DESTINATION_ROLE: Record<string, string> = {
  REGISTRAR: 'Registrar',
  DEAN: 'Dean',
  FINANCE: 'Accountant',
  HR: 'HRAdmin',
  IQAC: 'IQAC',
  OPERATIONS: 'CampusAdmin',
};

@Injectable()
export class PresidentExecutiveWorkflowService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: EnterpriseAuditService,
    private readonly notify: NotificationDispatchService,
    private readonly executiveAction: ExecutiveActionService,
    private readonly certificates: CertificateAutomationService,
  ) {}

  async reviewHrApproval(
    actor: ExecutiveActor,
    requestId: string,
    approve: boolean,
    note?: string,
  ) {
    const result = await this.executiveAction.reviewApproval(
      actor.tenantId,
      actor.userId,
      { category: 'HR', id: requestId, approve, note },
    );

    if (note) {
      await this.db.query(
        `UPDATE executive_hr_approval_requests
         SET review_note = $3
         WHERE tenant_id = $1 AND request_id = $2`,
        [actor.tenantId, requestId, note],
      );
    }

    const rows = await this.db.query(
      `SELECT request_id, request_type, title, requested_by, payload, amount
       FROM executive_hr_approval_requests
       WHERE tenant_id = $1 AND request_id = $2`,
      [actor.tenantId, requestId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (row?.requested_by) {
      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: String(row.requested_by),
        category: 'OPERATIONS',
        title: approve
          ? 'HR request approved by President'
          : 'HR request rejected by President',
        message: `${String(row.title ?? 'HR request')} was ${approve ? 'approved' : 'rejected'} by the President.`,
        actionLink: '/hr/dashboard',
        severity: approve ? 'info' : 'warning',
        intent: 'status_update',
        queueDelivery: true,
      });
    }

    if (approve && row) {
      await this.propagateHrApproval(actor, row);
    }

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'executive_hr_approval_requests',
      action: approve ? 'PRESIDENT_HR_APPROVED' : 'PRESIDENT_HR_REJECTED',
      recordId: requestId,
      newValue: {
        status: approve ? 'APPROVED' : 'REJECTED',
        note: note ?? null,
      },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return result;
  }

  async createExecutiveOrder(
    actor: ExecutiveActor,
    dto: {
      subject: string;
      body: string;
      destination_module: string;
      order_type?: string;
      assigned_to_user_id?: string;
    },
  ) {
    const module = dto.destination_module.toUpperCase();
    if (!DESTINATION_INBOX[module]) {
      throw new BadRequestException('Invalid destination module');
    }

    const year = new Date().getFullYear();
    const codeRows = await this.db.query(
      `SELECT COALESCE(MAX(
         NULLIF(SUBSTRING(order_code FROM '([0-9]+)$'), '')::int
       ), 0) + 1 AS next_seq
       FROM leadership_executive_orders
       WHERE tenant_id = $1 AND order_code LIKE $2`,
      [actor.tenantId, `EO-${year}-%`],
    );
    const seq = Number(codeRows[0]?.next_seq ?? 1);
    const orderCode = `EO-${year}-${String(seq).padStart(4, '0')}`;

    let assignee = dto.assigned_to_user_id ?? null;
    if (!assignee) {
      const roleName = DESTINATION_ROLE[module];
      const roleRows = await this.db.query(
        `SELECT u.user_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND r.role_name = $2 AND u.is_active = true
         LIMIT 1`,
        [actor.tenantId, roleName],
      );
      assignee = roleRows[0]?.user_id ?? null;
    }

    const taskRows = assignee
      ? await this.db.query(
          `INSERT INTO executive_tasks
             (tenant_id, title, description, priority, status, assigned_to, assigned_by, due_at)
           VALUES ($1, $2, $3, 'HIGH', 'OPEN', $4, $5, NOW() + INTERVAL '7 days')
           RETURNING task_id`,
          [actor.tenantId, dto.subject, dto.body, assignee, actor.userId],
        )
      : [];

    const linkedTaskId = taskRows[0]?.task_id ?? null;

    const orderRows = await this.db.query(
      `INSERT INTO leadership_executive_orders
         (tenant_id, order_code, subject, body, order_type, destination_module,
          destination_role, assigned_to_user_id, status, issued_by, linked_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ISSUED', $9, $10)
       RETURNING *`,
      [
        actor.tenantId,
        orderCode,
        dto.subject,
        dto.body,
        dto.order_type ?? 'DIRECTIVE',
        module,
        DESTINATION_ROLE[module] ?? null,
        assignee,
        actor.userId,
        linkedTaskId,
      ],
    );

    if (assignee) {
      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: String(assignee),
        category: 'OPERATIONS',
        title: `Executive Order ${orderCode}`,
        message: dto.subject,
        actionLink: DESTINATION_INBOX[module],
        severity: 'warning',
        intent: 'action_required',
        queueDelivery: true,
      });
    }

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'leadership_executive_orders',
      action: 'EXECUTIVE_ORDER_ISSUED',
      recordId: orderRows[0].order_id,
      newValue: {
        order_code: orderCode,
        destination_module: module,
        assigned_to_user_id: assignee,
        linked_task_id: linkedTaskId,
      },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return orderRows[0];
  }

  async updateExecutiveOrderStatus(
    actor: ExecutiveActor,
    orderId: string,
    status: string,
  ) {
    const allowed = ['ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Invalid order status');
    }

    const rows = await this.db.query(
      `UPDATE leadership_executive_orders
       SET status = $3::varchar,
           updated_at = NOW(),
           completed_at = CASE WHEN $3::varchar = 'COMPLETED' THEN NOW() ELSE completed_at END
       WHERE tenant_id = $1 AND order_id = $2
       RETURNING *`,
      [actor.tenantId, orderId, status],
    );
    if (!rows[0]) throw new NotFoundException('Executive order not found');

    if (rows[0].linked_task_id && status === 'COMPLETED') {
      await this.db.query(
        `UPDATE executive_tasks SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
         WHERE task_id = $1`,
        [rows[0].linked_task_id],
      );
    }

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'leadership_executive_orders',
      action: 'EXECUTIVE_ORDER_STATUS',
      recordId: orderId,
      newValue: { status },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return rows[0];
  }

  async presidentEscalateGrievance(
    actor: ExecutiveActor,
    ticketId: string,
    dto: { decision: string; assigned_officer_user_id?: string },
  ) {
    const tickets = await this.db.query(
      `SELECT ticket_id, subject, escalation_level, status, student_user_id
       FROM helpdesk_tickets
       WHERE ticket_id = $1 AND tenant_id = $2`,
      [ticketId, actor.tenantId],
    );
    if (!tickets[0]) throw new NotFoundException('Ticket not found');
    const ticket = tickets[0] as {
      escalation_level: number;
      subject: string;
      student_user_id: string;
    };

    if (Number(ticket.escalation_level ?? 0) < 4) {
      throw new BadRequestException(
        'Grievance must reach Registrar escalation (level 4) before President executive decision',
      );
    }

    const officerId = dto.assigned_officer_user_id ?? null;
    const updated = await this.db.query(
      `UPDATE helpdesk_tickets
       SET president_decision = $3,
           assigned_officer_user_id = COALESCE($4, assigned_officer_user_id),
           president_escalated_at = NOW(),
           president_escalated_by = $5,
           escalation_level = GREATEST(COALESCE(escalation_level, 0), 5),
           status = CASE WHEN $4 IS NOT NULL THEN 'IN_PROGRESS' ELSE status END,
           updated_at = NOW()
       WHERE ticket_id = $1 AND tenant_id = $2
       RETURNING ticket_id, escalation_level, status`,
      [ticketId, actor.tenantId, dto.decision, officerId, actor.userId],
    );

    if (officerId) {
      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: officerId,
        category: 'OPERATIONS',
        title: 'President executive decision — grievance assigned',
        message: dto.decision,
        actionLink: '/admin-ops/dashboard',
        severity: 'warning',
        intent: 'action_required',
        queueDelivery: true,
      });
    }

    if (ticket.student_user_id) {
      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: String(ticket.student_user_id),
        category: 'OPERATIONS',
        title: 'President office — grievance update',
        message: `Your grievance "${ticket.subject}" received an executive decision.`,
        actionLink: '/student/helpdesk',
        severity: 'info',
        intent: 'status_update',
        queueDelivery: true,
      });
    }

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'helpdesk_tickets',
      action: 'PRESIDENT_GRIEVANCE_DECISION',
      recordId: ticketId,
      newValue: {
        decision: dto.decision,
        assigned_officer_user_id: officerId,
        escalation_level: updated[0]?.escalation_level,
      },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return {
      success: true,
      ticket_id: ticketId,
      president_decision: dto.decision,
      assigned_officer_user_id: officerId,
      escalation_level: updated[0]?.escalation_level,
    };
  }

  async ratifyConvocation(
    actor: ExecutiveActor,
    applicationId: string,
    approve: boolean,
    note?: string,
  ) {
    const rows = await this.db.query(
      `SELECT application_id, student_user_id, verification_status, president_ratification_status
       FROM cert_applications
       WHERE tenant_id = $1 AND application_id = $2`,
      [actor.tenantId, applicationId],
    );
    if (!rows[0]) throw new NotFoundException('Application not found');
    const app = rows[0] as Record<string, unknown>;

    if (app.verification_status !== 'VERIFIED') {
      throw new BadRequestException(
        'Application must be Registrar-verified before ratification',
      );
    }
    if (
      !['PENDING', 'NOT_REQUIRED'].includes(
        String(app.president_ratification_status),
      )
    ) {
      throw new BadRequestException(
        'Application is not pending President ratification',
      );
    }

    const newStatus = approve ? 'RATIFIED' : 'REJECTED';
    const updated = await this.db.query(
      `UPDATE cert_applications
       SET president_ratification_status = $3,
           president_ratified_at = NOW(),
           president_ratified_by = $4,
           updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2
       RETURNING application_id, student_user_id, event_id`,
      [applicationId, actor.tenantId, newStatus, actor.userId],
    );
    if (!updated[0]) {
      throw new NotFoundException(
        'Application not found for ratification update',
      );
    }

    if (updated[0]?.student_user_id) {
      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: String(updated[0].student_user_id),
        category: 'OPERATIONS',
        title: approve
          ? 'Convocation ratified by President'
          : 'Convocation ratification declined',
        message: approve
          ? 'Your degree application has received final executive ratification.'
          : note ||
            'Your convocation application requires Registrar follow-up.',
        actionLink: '/student/certificates',
        severity: approve ? 'info' : 'warning',
        intent: 'status_update',
        queueDelivery: true,
      });
    }

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'cert_applications',
      action: approve
        ? 'PRESIDENT_CONVOCATION_RATIFIED'
        : 'PRESIDENT_CONVOCATION_REJECTED',
      recordId: applicationId,
      newValue: {
        president_ratification_status: newStatus,
        note: note ?? null,
      },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    if (approve) {
      await this.certificates.releaseCertificateAfterRatification(
        actor.tenantId,
        applicationId,
        actor.userId,
      );
    }

    return updated[0];
  }

  async complianceAction(
    actor: ExecutiveActor,
    assignmentId: string,
    action:
      | 'ASSIGN_INVESTIGATION'
      | 'ESCALATE_DEPARTMENT'
      | 'REQUEST_REPORT'
      | 'MARK_REVIEWED',
    note?: string,
  ) {
    const rows = await this.db.query(
      `SELECT ta.assignment_id, ta.assigned_to, ta.task_id, ta.status,
              tm.task_name, u.name AS owner_name, u.dept_id
       FROM task_assignments ta
       JOIN task_master tm ON tm.task_id = ta.task_id
       JOIN users u ON u.user_id = ta.assigned_to
       WHERE ta.assignment_id = $1`,
      [assignmentId],
    );
    if (!rows[0])
      throw new NotFoundException('Compliance assignment not found');
    const row = rows[0] as Record<string, unknown>;

    let newStatus = String(row.status);
    if (action === 'MARK_REVIEWED') newStatus = 'Completed';

    await this.db.query(
      `UPDATE task_assignments SET status = $2 WHERE assignment_id = $1`,
      [assignmentId, newStatus],
    );

    const hodRows = await this.db.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'HOD'
         AND ($2::int IS NULL OR u.dept_id = $2)
       LIMIT 1`,
      [actor.tenantId, row.dept_id ?? null],
    );
    const notifyUser = hodRows[0]?.user_id ?? row.assigned_to;

    await this.notify.dispatch({
      tenantId: actor.tenantId,
      userId: String(notifyUser),
      category: 'OPERATIONS',
      title: `President compliance action: ${action.replace(/_/g, ' ')}`,
      message:
        note || String(row.task_name ?? 'Compliance task requires attention'),
      actionLink: '/iqac/dashboard',
      severity: 'warning',
      intent: 'action_required',
      queueDelivery: true,
    });

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'task_assignments',
      action: `PRESIDENT_COMPLIANCE_${action}`,
      recordId: assignmentId,
      newValue: { action, note: note ?? null, status: newStatus },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return { assignment_id: assignmentId, action, status: newStatus };
  }

  async createMeetingActionItems(
    actor: ExecutiveActor,
    meetingId: string,
    items: Array<{
      title: string;
      assigned_to_user_id: string;
      due_at?: string;
    }>,
  ) {
    const created: string[] = [];
    for (const item of items) {
      const taskRows = await this.db.query(
        `INSERT INTO executive_tasks
           (tenant_id, title, description, priority, status, assigned_to, assigned_by, due_at)
         VALUES ($1, $2, $3, 'HIGH', 'OPEN', $4, $5, COALESCE($6::timestamptz, NOW() + INTERVAL '14 days'))
         RETURNING task_id`,
        [
          actor.tenantId,
          item.title,
          `Meeting action item from ${meetingId}`,
          item.assigned_to_user_id,
          actor.userId,
          item.due_at ?? null,
        ],
      );

      const actionRows = await this.db.query(
        `INSERT INTO meeting_executive_action_items
           (tenant_id, meeting_id, title, assigned_to_user_id, assigned_by, due_at, linked_executive_task_id)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW() + INTERVAL '14 days'), $7)
         RETURNING action_item_id`,
        [
          actor.tenantId,
          meetingId,
          item.title,
          item.assigned_to_user_id,
          actor.userId,
          item.due_at ?? null,
          taskRows[0]?.task_id ?? null,
        ],
      );
      created.push(actionRows[0].action_item_id);

      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: item.assigned_to_user_id,
        category: 'OPERATIONS',
        title: 'Meeting action item assigned',
        message: item.title,
        actionLink: '/president/meetings',
        severity: 'info',
        intent: 'action_required',
        queueDelivery: true,
      });
    }

    await this.audit.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'meeting_executive_action_items',
      action: 'MEETING_ACTION_ITEMS_CREATED',
      recordId: meetingId,
      newValue: { count: created.length, action_item_ids: created },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return { meeting_id: meetingId, action_item_ids: created };
  }

  async listPendingRatifications(tenantId: string) {
    return this.db.query(
      `SELECT ca.application_id, u.name AS student_name,
              COALESCE(sp.branch_name, sp.batch, 'Programme') AS program,
              ca.verification_status, ca.president_ratification_status, ca.updated_at
       FROM cert_applications ca
       JOIN users u ON u.user_id = ca.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = ca.student_user_id
       WHERE ca.tenant_id = $1
         AND ca.verification_status = 'VERIFIED'
         AND ca.president_ratification_status = 'PENDING'
         AND ca.certificate_generated = false
       ORDER BY ca.updated_at ASC
       LIMIT 100`,
      [tenantId],
    );
  }

  private async propagateHrApproval(
    actor: ExecutiveActor,
    row: Record<string, unknown>,
  ) {
    const requestType = String(row.request_type ?? '');
    const payload =
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {};

    if (requestType === 'PAYROLL_BULK' || requestType === 'BONUS_ALLOCATION') {
      const payslipIds = Array.isArray(payload.payslip_ids)
        ? (payload.payslip_ids as string[])
        : [];
      if (payslipIds.length) {
        await this.db.query(
          `UPDATE staff_payslips
           SET is_published = true,
               published_at = COALESCE(published_at, NOW())
           WHERE tenant_id = $1 AND payslip_id = ANY($2::uuid[])`,
          [actor.tenantId, payslipIds],
        );
      }
    }

    const hrRows = await this.db.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('HRAdmin', 'HR') AND u.is_active = true
       LIMIT 1`,
      [actor.tenantId],
    );
    const hrUserId = hrRows[0]?.user_id;
    if (hrUserId) {
      await this.db.query(
        `INSERT INTO executive_tasks
           (tenant_id, title, description, priority, status, assigned_to, assigned_by, due_at)
         VALUES ($1, $2, $3, 'HIGH', 'OPEN', $4, $5, NOW() + INTERVAL '5 days')`,
        [
          actor.tenantId,
          `Execute approved HR request: ${String(row.title ?? requestType)}`,
          `President approved ${requestType}. Complete HR records and payroll updates.`,
          hrUserId,
          actor.userId,
        ],
      );
      await this.notify.dispatch({
        tenantId: actor.tenantId,
        userId: String(hrUserId),
        category: 'OPERATIONS',
        title: 'President approved HR request — action required',
        message: String(row.title ?? 'HR approval'),
        actionLink: '/hr/dashboard',
        severity: 'warning',
        intent: 'action_required',
        queueDelivery: true,
      });
    }
  }
}
