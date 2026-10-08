import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import type { NotificationMessage } from '../../core/notifications/notification-message.types';

type AuthUser = { user_id: string; tenant_id?: string };

@Injectable()
export class ExecutiveActionService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifyDispatch: NotificationDispatchService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private execNotify(
    title: string,
    message: string,
    actionLink?: string,
  ): NotificationMessage {
    return {
      category: 'OPERATIONS',
      title,
      message,
      actionLink,
      actionLabel: actionLink ? 'Open' : undefined,
      severity: 'warning',
      intent: 'action_required',
    };
  }

  async getActionCenterSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const inbox = await this.getApprovalInbox(tid);
    const [tasks, overdueTasks, mouExpiring, complianceDue, vipPipeline] =
      await Promise.all([
        this.db
          .query(
            `SELECT COUNT(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS'))::int AS open_count
           FROM executive_tasks WHERE tenant_id = $1`,
            [tid],
          )
          .catch(() => [{ open_count: 0 }]),
        this.db
          .query(
            `SELECT COUNT(*)::int AS cnt FROM executive_tasks
           WHERE tenant_id = $1 AND status IN ('OPEN', 'IN_PROGRESS') AND due_at < NOW()`,
            [tid],
          )
          .catch(() => [{ cnt: 0 }]),
        this.db
          .query(
            `SELECT COUNT(*)::int AS cnt FROM executive_mou_tracker
           WHERE tenant_id = $1 AND expires_on <= CURRENT_DATE + INTERVAL '30 days' AND status != 'EXPIRED'`,
            [tid],
          )
          .catch(() => [{ cnt: 0 }]),
        this.db
          .query(
            `SELECT COUNT(*)::int AS cnt FROM compliance_calendar_events
           WHERE tenant_id = $1 AND due_date <= CURRENT_DATE + INTERVAL '14 days' AND status != 'COMPLETED'`,
            [tid],
          )
          .catch(() => [{ cnt: 0 }]),
        this.db
          .query(
            `SELECT COUNT(*)::int AS cnt FROM vip_contacts
           WHERE tenant_id = $1 AND pipeline_stage IN ('PROSPECTED', 'PITCHED', 'PLEDGED')`,
            [tid],
          )
          .catch(() => [{ cnt: 0 }]),
      ]);

    return {
      pending_approvals: inbox.filter((i) => i.status === 'PENDING').length,
      open_tasks: Number(tasks[0]?.open_count ?? 0),
      overdue_tasks: Number(overdueTasks[0]?.cnt ?? 0),
      mou_expiring_30d: Number(mouExpiring[0]?.cnt ?? 0),
      compliance_due_14d: Number(complianceDue[0]?.cnt ?? 0),
      active_fundraising_leads: Number(vipPipeline[0]?.cnt ?? 0),
      inbox_preview: inbox.slice(0, 5),
    };
  }

  async getApprovalInbox(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [finance, budget, waivers, hr, academic] = await Promise.all([
      this.db
        .query(
          `SELECT approval_id AS id, 'FINANCE' AS category, entity_type AS subtype,
                amount, status, requested_by, created_at,
                'High-value ' || entity_type AS title
         FROM fin_approval_requests WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT request_id AS id, 'BUDGET' AS category, 'EXPANSION' AS subtype,
                requested_amount AS amount, status, requested_by, created_at,
                reason AS title
         FROM fin_budget_expansion_requests WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT request_id AS id, 'FEE_WAIVER' AS category, 'WAIVER' AS subtype,
                waiver_amount AS amount, status, requested_by, created_at,
                reason AS title
         FROM executive_fee_waiver_requests WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT request_id AS id, 'HR' AS category, request_type AS subtype,
                amount, status, requested_by, created_at, title
         FROM executive_hr_approval_requests WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT request_id AS id, 'ACADEMIC' AS category, request_type AS subtype,
                NULL::numeric AS amount, status, requested_by, created_at, title
         FROM executive_academic_approval_requests WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
          [tid],
        )
        .catch(() => []),
    ]);

    return [...finance, ...budget, ...waivers, ...hr, ...academic]
      .map((r: Record<string, unknown>) => ({
        id: r.id,
        category: r.category,
        subtype: r.subtype,
        title: String(r.title ?? r.subtype ?? 'Approval'),
        amount: r.amount != null ? Number(r.amount) : null,
        status: r.status,
        requested_by: r.requested_by,
        created_at: r.created_at,
      }))
      .sort(
        (a, b) =>
          new Date(String(b.created_at)).getTime() -
          new Date(String(a.created_at)).getTime(),
      );
  }

  async reviewApproval(
    tenantId: string | undefined,
    reviewerId: string,
    dto: {
      category: string;
      id: string;
      approve: boolean;
      note?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const status = dto.approve ? 'APPROVED' : 'REJECTED';

    if (dto.category === 'BUDGET') {
      const existing = await this.db.query(
        `SELECT request_id, requested_by, reason, budget_id, requested_amount, status
         FROM fin_budget_expansion_requests
         WHERE tenant_id = $1 AND request_id = $2`,
        [tid, dto.id],
      );
      if (!existing[0])
        throw new NotFoundException('Budget expansion request not found');

      await this.db.query(
        `UPDATE fin_budget_expansion_requests
         SET status = $3, reviewed_by = $4, reviewed_at = NOW()
         WHERE tenant_id = $1 AND request_id = $2`,
        [tid, dto.id, status, reviewerId],
      );

      const row = existing[0] as {
        requested_by: string;
        reason: string;
        requested_amount: number;
      };

      if (row.requested_by) {
        await this.notifyDispatch.dispatch({
          tenantId: tid,
          userId: String(row.requested_by),
          ...this.execNotify(
            dto.approve
              ? 'Budget expansion approved'
              : 'Budget expansion rejected',
            `${row.reason ?? 'Budget request'} was ${status.toLowerCase()} by executive review.`,
            '/finance/dashboard',
          ),
          queueDelivery: true,
        });
      }

      const hodRows = await this.db.query(
        `SELECT u.user_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         JOIN fin_dept_budgets b ON b.department_id = u.dept_id
         WHERE b.budget_id = $1 AND r.role_name = 'HOD' AND u.is_active = true
         LIMIT 1`,
        [(existing[0] as { budget_id: string }).budget_id],
      );
      if (hodRows[0]?.user_id) {
        await this.notifyDispatch.dispatch({
          tenantId: tid,
          userId: String(hodRows[0].user_id),
          ...this.execNotify(
            'Annual budget decision',
            `Executive ${status.toLowerCase()} budget expansion of ₹${Number(row.requested_amount ?? 0).toLocaleString('en-IN')}.`,
            '/hod/dashboard',
          ),
          queueDelivery: true,
        });
      }

      await this.audit.log({
        tenantId: tid,
        userId: reviewerId,
        module: 'fin_budget_expansion_requests',
        action: dto.approve
          ? 'PRESIDENT_BUDGET_APPROVED'
          : 'PRESIDENT_BUDGET_REJECTED',
        recordId: dto.id,
        newValue: { status, note: dto.note ?? null },
      });

      return { ok: true, status };
    }

    if (dto.category === 'FEE_WAIVER') {
      await this.db.query(
        `UPDATE executive_fee_waiver_requests
         SET status = $3, reviewed_by = $4, reviewed_at = NOW(), review_note = $5
         WHERE tenant_id = $1 AND request_id = $2`,
        [tid, dto.id, status, reviewerId, dto.note ?? null],
      );
      return { ok: true, status };
    }

    if (dto.category === 'HR') {
      await this.db.query(
        `UPDATE executive_hr_approval_requests
         SET status = $3, reviewed_by = $4, reviewed_at = NOW()
         WHERE tenant_id = $1 AND request_id = $2`,
        [tid, dto.id, status, reviewerId],
      );
      return { ok: true, status };
    }

    if (dto.category === 'ACADEMIC') {
      await this.db.query(
        `UPDATE executive_academic_approval_requests
         SET status = $3, reviewed_by = $4, reviewed_at = NOW()
         WHERE tenant_id = $1 AND request_id = $2`,
        [tid, dto.id, status, reviewerId],
      );
      return { ok: true, status };
    }

    if (dto.category === 'FINANCE') {
      throw new BadRequestException(
        'Finance approvals require OTP verification via /api/finance/approvals/:id/verify-otp',
      );
    }

    throw new NotFoundException('Unknown approval category');
  }

  async getThresholds(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT category, auto_approve_below, chairman_approval_above, currency, is_active
       FROM executive_approval_thresholds WHERE tenant_id = $1 ORDER BY category`,
        [tid],
      )
      .catch(() => []);
  }

  async updateThreshold(
    tenantId: string | undefined,
    userId: string,
    dto: {
      category: string;
      auto_approve_below: number;
      chairman_approval_above: number;
    },
  ) {
    const tid = this.tenantId(tenantId);
    await this.db.query(
      `INSERT INTO executive_approval_thresholds
         (tenant_id, category, auto_approve_below, chairman_approval_above, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, category) DO UPDATE SET
         auto_approve_below = EXCLUDED.auto_approve_below,
         chairman_approval_above = EXCLUDED.chairman_approval_above,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [
        tid,
        dto.category,
        dto.auto_approve_below,
        dto.chairman_approval_above,
        userId,
      ],
    );
    return { ok: true };
  }

  async listTasks(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db
      .query(
        `SELECT t.*, assignee.name AS assignee_name, assigner.name AS assigner_name
       FROM executive_tasks t
       JOIN users assignee ON assignee.user_id = t.assigned_to
       JOIN users assigner ON assigner.user_id = t.assigned_by
       WHERE t.tenant_id = $1
       ORDER BY CASE WHEN t.due_at < NOW() AND t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END,
                t.due_at ASC`,
        [tid],
      )
      .catch(() => []);
    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      overdue:
        ['OPEN', 'IN_PROGRESS'].includes(String(r.status)) &&
        new Date(String(r.due_at)) < new Date(),
    }));
  }

  async createTask(
    tenantId: string | undefined,
    assignerId: string,
    dto: {
      title: string;
      description?: string;
      assigned_to: string;
      due_at: string;
      priority?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `INSERT INTO executive_tasks
         (tenant_id, title, description, assigned_to, assigned_by, due_at, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tid,
        dto.title,
        dto.description ?? null,
        dto.assigned_to,
        assignerId,
        dto.due_at,
        dto.priority ?? 'HIGH',
      ],
    );
    const task = rows[0] as { task_id: string; title: string };
    await this.notifyDispatch
      .dispatch({
        tenantId: tid,
        userId: dto.assigned_to,
        ...this.execNotify(
          'Executive task assigned',
          dto.title,
          '/leadership/tasks',
        ),
        queueDelivery: true,
      })
      .catch(() => undefined);
    return task;
  }

  async updateTaskStatus(
    tenantId: string | undefined,
    taskId: string,
    status: string,
  ) {
    const tid = this.tenantId(tenantId);
    await this.db.query(
      `UPDATE executive_tasks SET status = $3, completed_at = CASE WHEN $3 = 'COMPLETED' THEN NOW() ELSE completed_at END, updated_at = NOW()
       WHERE tenant_id = $1 AND task_id = $2`,
      [tid, taskId, status],
    );
    return { ok: true };
  }

  async sendMemo(
    tenantId: string | undefined,
    senderId: string,
    dto: {
      subject: string;
      body: string;
      audience_roles: string[];
      confidential?: boolean;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const memoRows = await this.db.query(
      `INSERT INTO executive_memos (tenant_id, subject, body, audience_roles, sent_by, confidential)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING memo_id`,
      [
        tid,
        dto.subject,
        dto.body,
        dto.audience_roles,
        senderId,
        dto.confidential ?? true,
      ],
    );
    const memoId = (memoRows[0] as { memo_id: string }).memo_id;

    const recipients = await this.db.query<Array<{ user_id: string }>>(
      `SELECT DISTINCT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = ANY($2::text[])`,
      [tid, dto.audience_roles],
    );

    for (const r of recipients) {
      await this.db.query(
        `INSERT INTO executive_memo_recipients (memo_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [memoId, r.user_id],
      );
      await this.notifyDispatch
        .dispatch({
          tenantId: tid,
          userId: r.user_id,
          ...this.execNotify(
            dto.confidential ? 'Confidential executive memo' : 'Executive memo',
            dto.subject,
            '/leadership/memos',
          ),
          queueDelivery: true,
        })
        .catch(() => undefined);
    }

    return { memo_id: memoId, recipient_count: recipients.length };
  }

  async listMemos(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT memo_id, subject, confidential, audience_roles, sent_at,
              (SELECT COUNT(*)::int FROM executive_memo_recipients r WHERE r.memo_id = m.memo_id) AS recipient_count
       FROM executive_memos m WHERE tenant_id = $1 ORDER BY sent_at DESC LIMIT 50`,
        [tid],
      )
      .catch(() => []);
  }

  async sendBroadcast(
    tenantId: string | undefined,
    senderId: string,
    dto: {
      subject: string;
      body: string;
      channels: string[];
      audience_filter: Record<string, unknown>;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const role = dto.audience_filter.role as string | undefined;
    const params: unknown[] = [tid];
    let roleClause = '';
    if (role) {
      roleClause = ` AND r.role_name = $2`;
      params.push(role);
    }
    const users = await this.db.query<Array<{ user_id: string }>>(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true${roleClause}`,
      params,
    );

    for (const u of users.slice(0, 500)) {
      if (dto.channels.includes('EMAIL') || dto.channels.includes('PUSH')) {
        await this.notifyDispatch
          .dispatch({
            tenantId: tid,
            userId: u.user_id,
            ...this.execNotify(dto.subject, dto.body.slice(0, 500)),
            queueDelivery: true,
          })
          .catch(() => undefined);
      }
    }

    const rows = await this.db.query(
      `INSERT INTO executive_broadcasts (tenant_id, subject, body, channels, audience_filter, sent_by, recipient_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING broadcast_id, sent_at`,
      [
        tid,
        dto.subject,
        dto.body,
        dto.channels,
        dto.audience_filter,
        senderId,
        users.length,
      ],
    );
    return rows[0];
  }

  async listBroadcasts(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT broadcast_id, subject, channels, recipient_count, sent_at
       FROM executive_broadcasts WHERE tenant_id = $1 ORDER BY sent_at DESC LIMIT 30`,
        [tid],
      )
      .catch(() => []);
  }

  async listDocuments(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT document_id, title, category, version, expires_at, created_at
       FROM executive_documents WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [tid],
      )
      .catch(() => []);
  }

  async registerDocument(
    tenantId: string | undefined,
    userId: string,
    dto: {
      title: string;
      category: string;
      storage_key: string;
      expires_at?: string;
    },
    ip?: string,
  ) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `INSERT INTO executive_documents (tenant_id, title, category, storage_key, expires_at, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING document_id`,
      [
        tid,
        dto.title,
        dto.category,
        dto.storage_key,
        dto.expires_at ?? null,
        userId,
      ],
    );
    const docId = (rows[0] as { document_id: string }).document_id;
    await this.logDocumentAccess(docId, userId, 'UPDATE', ip);
    return rows[0];
  }

  async logDocumentAccess(
    documentId: string,
    userId: string,
    action: string,
    ip?: string,
  ) {
    await this.db
      .query(
        `INSERT INTO executive_document_access_logs (document_id, user_id, action, ip_address)
       VALUES ($1, $2, $3, $4)`,
        [documentId, userId, action, ip ?? null],
      )
      .catch(() => undefined);
  }

  async listDocumentAccessLogs(tenantId?: string, documentId?: string) {
    const tid = this.tenantId(tenantId);
    if (documentId) {
      return this.db
        .query(
          `SELECT l.*, u.name AS user_name FROM executive_document_access_logs l
         JOIN users u ON u.user_id = l.user_id
         JOIN executive_documents d ON d.document_id = l.document_id
         WHERE d.tenant_id = $1 AND l.document_id = $2 ORDER BY l.created_at DESC LIMIT 100`,
          [tid, documentId],
        )
        .catch(() => []);
    }
    return this.db
      .query(
        `SELECT l.*, d.title, u.name AS user_name FROM executive_document_access_logs l
       JOIN executive_documents d ON d.document_id = l.document_id
       JOIN users u ON u.user_id = l.user_id
       WHERE d.tenant_id = $1 ORDER BY l.created_at DESC LIMIT 100`,
        [tid],
      )
      .catch(() => []);
  }

  async listMous(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT *, CASE WHEN expires_on <= CURRENT_DATE + INTERVAL '30 days' THEN true ELSE false END AS renewal_alert
       FROM executive_mou_tracker WHERE tenant_id = $1 ORDER BY expires_on ASC`,
        [tid],
      )
      .catch(() => []);
  }

  async listVipContacts(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT * FROM vip_contacts WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [tid],
      )
      .catch(() => []);
  }

  async upsertVipContact(
    tenantId: string | undefined,
    dto: Record<string, unknown> & { contact_id?: string },
  ) {
    const tid = this.tenantId(tenantId);
    if (dto.contact_id) {
      await this.db.query(
        `UPDATE vip_contacts SET full_name = $3, organization = $4, contact_type = $5,
         email = $6, phone = $7, pipeline_stage = $8, pledged_amount = $9, notes = $10,
         last_touch_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND contact_id = $2`,
        [
          tid,
          dto.contact_id,
          dto.full_name,
          dto.organization ?? null,
          dto.contact_type ?? 'HNI',
          dto.email ?? null,
          dto.phone ?? null,
          dto.pipeline_stage ?? 'PROSPECTED',
          dto.pledged_amount ?? null,
          dto.notes ?? null,
        ],
      );
      return { contact_id: dto.contact_id };
    }
    const rows = await this.db.query(
      `INSERT INTO vip_contacts (tenant_id, full_name, organization, contact_type, email, phone, pipeline_stage, pledged_amount, notes, last_touch_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING contact_id`,
      [
        tid,
        dto.full_name,
        dto.organization ?? null,
        dto.contact_type ?? 'HNI',
        dto.email ?? null,
        dto.phone ?? null,
        dto.pipeline_stage ?? 'PROSPECTED',
        dto.pledged_amount ?? null,
        dto.notes ?? null,
      ],
    );
    return rows[0];
  }

  async listComplianceCalendar(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    return this.db
      .query(
        `SELECT * FROM compliance_calendar_events WHERE tenant_id = $1 ORDER BY due_date ASC`,
        [tid],
      )
      .catch(() => []);
  }

  async createComplianceEvent(
    tenantId: string | undefined,
    dto: {
      title: string;
      event_type: string;
      due_date: string;
      notes?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `INSERT INTO compliance_calendar_events (tenant_id, title, event_type, due_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tid, dto.title, dto.event_type, dto.due_date, dto.notes ?? null],
    );
    return rows[0];
  }

  async getPredictiveForecast(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [yoy, programs, faculty, hostel] = await Promise.all([
      this.db
        .query(
          `SELECT EXTRACT(YEAR FROM created_at)::int AS year,
                COUNT(*) FILTER (WHERE stage = 'INQUIRY' OR stage = 'RAW_LEAD')::int AS inquiries,
                COUNT(*) FILTER (WHERE stage = 'ENROLLED')::int AS enrolled
         FROM admissions_leads WHERE tenant_id = $1 AND deleted_at IS NULL
           AND created_at >= NOW() - INTERVAL '3 years'
         GROUP BY 1 ORDER BY 1`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT p.program_name,
                COALESCE(SUM(s.capacity), 0)::int AS capacity,
                COUNT(DISTINCT sp.user_id)::int AS enrolled
         FROM academic_programs p
         LEFT JOIN academic_sections s ON s.program_id = p.program_id
         LEFT JOIN student_profiles sp ON sp.program_id = p.program_id AND sp.admission_status = 'ACTIVE'
         WHERE p.tenant_id = $1 GROUP BY p.program_id, p.program_name`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT total_students, total_faculty FROM exec_daily_university_health WHERE tenant_id = $1 LIMIT 1`,
          [tid],
        )
        .catch(() => [{ total_students: 0, total_faculty: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE b.status = 'OCCUPIED')::int AS occupied
         FROM operations_hostel_beds b
         JOIN operations_hostel_rooms r ON r.room_id = b.room_id WHERE r.tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ total: 0, occupied: 0 }]),
    ]);

    const years = yoy as Array<{
      year: number;
      inquiries: number;
      enrolled: number;
    }>;
    const avgConversion =
      years.length > 0
        ? years.reduce(
            (s, y) => s + (y.inquiries ? y.enrolled / y.inquiries : 0),
            0,
          ) / years.length
        : 0.05;

    const programForecasts = (programs as Array<Record<string, unknown>>).map(
      (p) => {
        const cap = Number(p.capacity ?? 0);
        const en = Number(p.enrolled ?? 0);
        const seatsOpen = Math.max(cap - en, 0);
        const leadsNeeded =
          avgConversion > 0
            ? Math.ceil(seatsOpen / avgConversion)
            : seatsOpen * 20;
        return {
          program: p.program_name,
          seats_open: seatsOpen,
          avg_conversion_rate_pct: Math.round(avgConversion * 100),
          marketing_leads_needed: leadsNeeded,
        };
      },
    );

    const health = faculty[0] ?? {};
    const students = Number(health.total_students ?? 0);
    const fac = Number(health.total_faculty ?? 0);
    const ratio = fac ? students / fac : 0;
    const targetRatio = 15;
    const additionalStudents = 500;
    const facultyNeeded = Math.max(
      0,
      Math.ceil((students + additionalStudents) / targetRatio - fac),
    );
    const hostelRow = hostel[0] ?? {};
    const bedsAvailable =
      Number(hostelRow.total ?? 0) - Number(hostelRow.occupied ?? 0);

    return {
      intake_analysis: {
        historical: years,
        avg_conversion_rate_pct: Math.round(avgConversion * 100),
        program_forecasts: programForecasts,
      },
      resource_forecasting: {
        current_faculty_student_ratio: Number(ratio.toFixed(1)),
        target_ratio: targetRatio,
        if_admit_500_more: {
          additional_faculty_needed: facultyNeeded,
          hostel_beds_available: bedsAvailable,
          hostel_sufficient: bedsAvailable >= additionalStudents * 0.6,
        },
      },
    };
  }

  async getGrievanceEscalationMatrix(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db
      .query(
        `SELECT category, COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'CLOSED'))::int AS open_count,
              COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days' AND status NOT IN ('RESOLVED', 'CLOSED'))::int AS stale_count
       FROM student_grievance_tickets WHERE tenant_id = $1
       GROUP BY category ORDER BY open_count DESC`,
        [tid],
      )
      .catch(() => []);
    const sensitive = ['SEXUAL_HARASSMENT', 'ANTI_RAGGING', 'DISCIPLINARY'];
    return {
      categories: rows,
      immediate_alert_categories: sensitive,
      alerts: (rows as Array<{ category: string; open_count: number }>).filter(
        (r) =>
          sensitive.includes(String(r.category).toUpperCase()) &&
          r.open_count > 0,
      ),
    };
  }
}
