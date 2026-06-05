import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { FinanceService } from '../finance/finance.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';
import { HostelAdminGateway } from './hostel-admin.gateway';

type AuthCtx = { userId: string; tenantId: string; roles: string[] };

@Injectable()
export class HostelAdminService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly finance: FinanceService,
    private readonly falconNotify: FalconNotificationsService,
    private readonly gateway: HostelAdminGateway,
  ) {}

  private isGlobalAdmin(roles: string[]) {
    return roles.some((r) => ['SuperAdmin', 'Registrar'].includes(r));
  }

  async getAccessibleHostelIds(ctx: AuthCtx): Promise<string[] | null> {
    if (this.isGlobalAdmin(ctx.roles)) return null;
    const rows = await this.db.query<Array<{ hostel_id: string }>>(
      `SELECT hostel_id FROM operations_hostel_warden_assignments WHERE user_id = $1`,
      [ctx.userId],
    );
    if (rows.length === 0) {
      const fallback = await this.db.query<Array<{ hostel_id: string }>>(
        `SELECT DISTINCT r.hostel_id FROM operations_hostel_rooms r
         WHERE r.warden_user_id = $1 AND r.hostel_id IS NOT NULL`,
        [ctx.userId],
      );
      return fallback.map((r) => r.hostel_id);
    }
    return rows.map((r) => r.hostel_id);
  }

  async assertHostelAccess(ctx: AuthCtx, hostelId: string | null | undefined) {
    if (!hostelId) {
      if (!this.isGlobalAdmin(ctx.roles)) {
        throw new ForbiddenException('All-hostels view requires Hostel Admin or Super Admin role.');
      }
      return;
    }
    const allowed = await this.getAccessibleHostelIds(ctx);
    if (allowed === null) return;
    if (!allowed.includes(hostelId)) {
      throw new ForbiddenException('You are not authorized for this hostel.');
    }
  }

  async listHostels(ctx: AuthCtx) {
    const allowed = await this.getAccessibleHostelIds(ctx);
    if (allowed === null) {
      return this.db.query(
        `SELECT * FROM operations_hostels WHERE tenant_id = $1 ORDER BY hostel_name`,
        [ctx.tenantId],
      );
    }
    if (allowed.length === 0) return [];
    return this.db.query(
      `SELECT * FROM operations_hostels WHERE tenant_id = $1 AND hostel_id = ANY($2::uuid[]) ORDER BY hostel_name`,
      [ctx.tenantId, allowed],
    );
  }

  async getDashboard(ctx: AuthCtx, hostelId?: string) {
    await this.assertHostelAccess(ctx, hostelId ?? null);
    const allowed = await this.getAccessibleHostelIds(ctx);
    const hostelClause =
      hostelId != null
        ? 'AND h.hostel_id = $2'
        : allowed
          ? 'AND h.hostel_id = ANY($2::uuid[])'
          : '';
    const params: unknown[] = [ctx.tenantId];
    if (hostelId) params.push(hostelId);
    else if (allowed) params.push(allowed);

    const [stats] = await this.db.query<
      Array<{
        total_hostels: string;
        total_students: string;
        available_beds: string;
        total_beds: string;
        pending_tickets: string;
      }>
    >(
      `SELECT
        (SELECT COUNT(*)::text FROM operations_hostels h WHERE h.tenant_id = $1 ${hostelClause}) AS total_hostels,
        (SELECT COUNT(DISTINCT a.student_user_id)::text
         FROM hostel_allocations a
         JOIN operations_hostel_rooms r ON r.room_id = a.room_id
         JOIN operations_hostels h ON h.hostel_id = r.hostel_id
         WHERE a.status = 'ACTIVE' AND h.tenant_id = $1 ${hostelClause}) AS total_students,
        (SELECT COUNT(*)::text FROM operations_hostel_beds b
         JOIN operations_hostel_rooms r ON r.room_id = b.room_id
         JOIN operations_hostels h ON h.hostel_id = r.hostel_id
         WHERE b.status = 'AVAILABLE' AND h.tenant_id = $1 ${hostelClause}) AS available_beds,
        (SELECT COUNT(*)::text FROM operations_hostel_beds b
         JOIN operations_hostel_rooms r ON r.room_id = b.room_id
         JOIN operations_hostels h ON h.hostel_id = r.hostel_id
         WHERE h.tenant_id = $1 ${hostelClause}) AS total_beds,
        (SELECT COUNT(*)::text FROM helpdesk_tickets t
         WHERE t.category = 'HOSTEL' AND t.status = 'PENDING') AS pending_tickets`,
      params,
    );

    const occupancyTrend = await this.db.query(
      `SELECT to_char(d.month, 'Mon') AS label,
              ROUND(100.0 * COALESCE(SUM(r.occupied), 0) / NULLIF(SUM(r.capacity), 0), 1) AS occupancy_pct
       FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months',
                            date_trunc('month', CURRENT_DATE), interval '1 month') d(month)
       LEFT JOIN operations_hostel_rooms r ON true
       LEFT JOIN operations_hostels h ON h.hostel_id = r.hostel_id AND h.tenant_id = $1
       ${hostelId ? 'WHERE h.hostel_id = $2' : allowed ? 'WHERE h.hostel_id = ANY($2::uuid[])' : ''}
       GROUP BY d.month
       ORDER BY d.month`,
      params,
    );

    const hostels = await this.listHostels(ctx);
    const alerts = hostels.map((h: { hostel_name: string; curfew_time: string }) => ({
      title: `Curfew — ${h.hostel_name}`,
      time: h.curfew_time ?? '22:00',
      type: 'schedule',
    }));
    alerts.unshift({ title: 'Morning Roll Call', time: '07:00', type: 'schedule' });

    const totalBeds = Number(stats?.total_beds ?? 0);
    const avail = Number(stats?.available_beds ?? 0);
    const occupiedPct = totalBeds > 0 ? Math.round(((totalBeds - avail) / totalBeds) * 100) : 0;

    return {
      metrics: {
        total_hostels: Number(stats?.total_hostels ?? 0),
        total_students: Number(stats?.total_students ?? 0),
        available_beds: avail,
        occupied_percent: occupiedPct,
        pending_tickets: Number(stats?.pending_tickets ?? 0),
      },
      occupancy_trend: occupancyTrend,
      alerts,
      pending_ticket_banner: Number(stats?.pending_tickets ?? 0) > 0,
    };
  }

  async getHostelDetail(ctx: AuthCtx, hostelId: string) {
    await this.assertHostelAccess(ctx, hostelId);
    const [hostel] = await this.db.query(
      `SELECT * FROM operations_hostels WHERE hostel_id = $1 AND tenant_id = $2`,
      [hostelId, ctx.tenantId],
    );
    if (!hostel) throw new NotFoundException('Hostel not found');
    const rooms = await this.db.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM operations_hostel_beds b WHERE b.room_id = r.room_id) AS bed_count,
        (SELECT COUNT(*) FROM operations_hostel_beds b WHERE b.room_id = r.room_id AND b.status = 'AVAILABLE') AS beds_available
       FROM operations_hostel_rooms r
       WHERE r.hostel_id = $1
       ORDER BY r.floor NULLS LAST, r.room_number`,
      [hostelId],
    );
    return { hostel, rooms };
  }

  async listStudents(ctx: AuthCtx, filters: { hostelId?: string; status?: string }) {
    if (filters.hostelId) await this.assertHostelAccess(ctx, filters.hostelId);
    else if (!this.isGlobalAdmin(ctx.roles)) {
      const allowed = await this.getAccessibleHostelIds(ctx);
      if (!allowed?.length) return [];
    }

    const allowed = await this.getAccessibleHostelIds(ctx);
    const params: unknown[] = [ctx.tenantId];
    let idx = 2;
    let clause = '';
    if (filters.hostelId) {
      clause += ` AND h.hostel_id = $${idx++}`;
      params.push(filters.hostelId);
    } else if (allowed) {
      clause += ` AND h.hostel_id = ANY($${idx++}::uuid[])`;
      params.push(allowed);
    }
    if (filters.status) {
      clause += ` AND a.status = $${idx++}`;
      params.push(filters.status);
    }

    return this.db.query(
      `SELECT a.allocation_id, a.status, a.bed_number, a.mess_plan,
              u.user_id AS student_user_id, u.name, u.email,
              COALESCE(sp.enrollment_no, u.official_email) AS student_id,
              h.hostel_name, h.hostel_code, r.room_number, r.floor, r.room_type,
              sp.batch AS program_name, d.dept_name,
              COALESCE(
                (SELECT MAX(e.semester) FROM student_course_enrollments e WHERE e.student_user_id = u.user_id),
                1
              ) AS year_of_study
       FROM hostel_allocations a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       LEFT JOIN operations_hostels h ON h.hostel_id = r.hostel_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 ${clause}
       ORDER BY u.name`,
      params,
    );
  }

  async markRollCall(ctx: AuthCtx, dto: { hostel_id: string; records: Array<{ student_user_id: string; status: string }> }) {
    await this.assertHostelAccess(ctx, dto.hostel_id);
    const today = new Date().toISOString().slice(0, 10);
    for (const rec of dto.records) {
      await this.db.query(
        `INSERT INTO operations_hostel_roll_call (hostel_id, student_user_id, roll_date, status, marked_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (hostel_id, student_user_id, roll_date)
         DO UPDATE SET status = EXCLUDED.status, marked_at = NOW(), marked_by_user_id = EXCLUDED.marked_by_user_id`,
        [dto.hostel_id, rec.student_user_id, today, rec.status, ctx.userId],
      );
    }
    return { marked: dto.records.length, roll_date: today };
  }

  async listRollCall(ctx: AuthCtx, hostelId: string, date: string) {
    await this.assertHostelAccess(ctx, hostelId);
    return this.db.query(
      `SELECT rc.*, u.name AS student_name, u.email, m.name AS marked_by_name
       FROM operations_hostel_roll_call rc
       JOIN users u ON u.user_id = rc.student_user_id
       JOIN users m ON m.user_id = rc.marked_by_user_id
       WHERE rc.hostel_id = $1 AND rc.roll_date = $2
       ORDER BY rc.marked_at DESC`,
      [hostelId, date],
    );
  }

  async leaveStats(ctx: AuthCtx, hostelId?: string) {
    if (hostelId) await this.assertHostelAccess(ctx, hostelId);
    const allowed = await this.getAccessibleHostelIds(ctx);
    const params: unknown[] = [];
    let clause = '';
    if (hostelId) {
      clause = 'WHERE hostel_id = $1';
      params.push(hostelId);
    } else if (allowed) {
      clause = 'WHERE hostel_id = ANY($1::uuid[])';
      params.push(allowed);
    }
    const [row] = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
       FROM operations_hostel_leaves ${clause}`,
      params,
    );
    return row ?? { pending: 0, approved: 0, rejected: 0 };
  }

  async listLeaves(ctx: AuthCtx, hostelId?: string, status?: string) {
    if (hostelId) await this.assertHostelAccess(ctx, hostelId);
    const allowed = await this.getAccessibleHostelIds(ctx);
    const params: unknown[] = [];
    const parts: string[] = [];
    let i = 1;
    if (hostelId) {
      parts.push(`l.hostel_id = $${i++}`);
      params.push(hostelId);
    } else if (allowed) {
      parts.push(`l.hostel_id = ANY($${i++}::uuid[])`);
      params.push(allowed);
    }
    if (status) {
      parts.push(`l.status = $${i++}`);
      params.push(status);
    }
    const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    return this.db.query(
      `SELECT l.*, u.name AS student_name, h.hostel_name
       FROM operations_hostel_leaves l
       JOIN users u ON u.user_id = l.student_user_id
       LEFT JOIN operations_hostels h ON h.hostel_id = l.hostel_id
       ${where}
       ORDER BY l.created_at DESC`,
      params,
    );
  }

  async updateLeaveStatus(ctx: AuthCtx, leaveId: string, status: 'APPROVED' | 'REJECTED') {
    const [leave] = await this.db.query<Array<{ hostel_id: string }>>(
      `SELECT hostel_id FROM operations_hostel_leaves WHERE leave_id = $1`,
      [leaveId],
    );
    if (!leave) throw new NotFoundException('Leave not found');
    await this.assertHostelAccess(ctx, leave.hostel_id);
    await this.db.query(
      `UPDATE operations_hostel_leaves SET status = $2, approved_by_user_id = $3, updated_at = NOW() WHERE leave_id = $1`,
      [leaveId, status, ctx.userId],
    );
    return { leave_id: leaveId, status };
  }

  async listGatePasses(ctx: AuthCtx, hostelId?: string) {
    if (hostelId) await this.assertHostelAccess(ctx, hostelId);
    const allowed = await this.getAccessibleHostelIds(ctx);
    const params: unknown[] = [ctx.tenantId];
    let clause = '';
    if (hostelId) {
      clause = 'AND (gp.hostel_id = $2 OR r.hostel_id = $2)';
      params.push(hostelId);
    } else if (allowed) {
      clause = 'AND (gp.hostel_id = ANY($2::uuid[]) OR r.hostel_id = ANY($2::uuid[]))';
      params.push(allowed);
    }

    const opsPasses = await this.db.query(
      `SELECT gp.pass_id, gp.pass_no, gp.student_user_id, gp.purpose, gp.reason,
              gp.expected_exit_at AS out_time, gp.status, gp.hostel_id,
              u.name AS student_name, h.hostel_name, 'operations' AS source
       FROM operations_gate_passes gp
       JOIN users u ON u.user_id = gp.student_user_id
       LEFT JOIN hostel_allocations a ON a.student_user_id = gp.student_user_id AND a.status = 'ACTIVE'
       LEFT JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       LEFT JOIN operations_hostels h ON h.hostel_id = COALESCE(gp.hostel_id, r.hostel_id)
       WHERE u.tenant_id = $1 ${clause}
       ORDER BY gp.created_at DESC
       LIMIT 200`,
      params,
    );

    let reqClause = '';
    const reqParams: unknown[] = [ctx.tenantId];
    if (hostelId) {
      reqClause = 'AND r.hostel_id = $2';
      reqParams.push(hostelId);
    } else if (allowed) {
      reqClause = 'AND r.hostel_id = ANY($2::uuid[])';
      reqParams.push(allowed);
    }

    const reqPasses = await this.db.query(
      `SELECT hr.request_id AS pass_id,
              ('HR-' || left(hr.request_id::text, 8)) AS pass_no,
              hr.student_user_id,
              COALESCE(hr.payload->>'destination', hr.remarks) AS purpose,
              hr.remarks AS reason,
              (hr.payload->>'out_date')::timestamptz AS out_time,
              hr.status,
              r.hostel_id,
              u.name AS student_name,
              h.hostel_name,
              'request' AS source
       FROM hostel_requests hr
       JOIN users u ON u.user_id = hr.student_user_id
       LEFT JOIN hostel_allocations a ON a.student_user_id = hr.student_user_id AND a.status = 'ACTIVE'
       LEFT JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       LEFT JOIN operations_hostels h ON h.hostel_id = r.hostel_id
       WHERE hr.request_type = 'GATE_PASS' AND u.tenant_id = $1 ${reqClause}
       ORDER BY hr.created_at DESC
       LIMIT 200`,
      reqParams,
    );

    return [...opsPasses, ...reqPasses];
  }

  broadcastGatePass(ctx: AuthCtx, payload: Record<string, unknown>) {
    this.gateway.emitToTenant(ctx.tenantId, 'gate_pass.updated', payload);
    if (payload.hostel_id) {
      this.gateway.emitToHostel(String(payload.hostel_id), 'gate_pass.updated', payload);
    }
  }

  async listVisitorsInside(ctx: AuthCtx, hostelId: string) {
    await this.assertHostelAccess(ctx, hostelId);
    return this.db.query(
      `SELECT * FROM operations_hostel_visitors
       WHERE hostel_id = $1 AND status = 'INSIDE'
       ORDER BY entry_at DESC`,
      [hostelId],
    );
  }

  async processVisitorScan(
    ctx: AuthCtx,
    dto: { pass_id: string; action: 'ENTRY' | 'EXIT'; hostel_id: string; visitor_name?: string },
  ) {
    await this.assertHostelAccess(ctx, dto.hostel_id);
    const passId = dto.pass_id.trim().toUpperCase();
    if (dto.action === 'ENTRY') {
      const [v] = await this.db.query(
        `INSERT INTO operations_hostel_visitors (hostel_id, pass_id, visitor_name, status, processed_by_user_id)
         VALUES ($1, $2, $3, 'INSIDE', $4)
         ON CONFLICT (pass_id) DO UPDATE SET status = 'INSIDE', entry_at = NOW(), exit_at = NULL
         RETURNING *`,
        [dto.hostel_id, passId, dto.visitor_name ?? 'Visitor', ctx.userId],
      );
      return v;
    }
    const [v] = await this.db.query(
      `UPDATE operations_hostel_visitors
       SET status = 'EXITED', exit_at = NOW(), processed_by_user_id = $3
       WHERE pass_id = $1 AND hostel_id = $2
       RETURNING *`,
      [passId, dto.hostel_id, ctx.userId],
    );
    if (!v) throw new NotFoundException('Visitor pass not found');
    return v;
  }

  async listTickets(ctx: AuthCtx, hostelId?: string, priority?: string) {
    if (hostelId) await this.assertHostelAccess(ctx, hostelId);
    let clause = `WHERE t.category = 'HOSTEL'`;
    const params: unknown[] = [];
    if (priority) {
      params.push(priority.toUpperCase());
      clause += ` AND upper(t.subject) LIKE $${params.length}`;
    }
    return this.db.query(
      `SELECT t.*, u.name AS student_name
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       ${clause}
       ORDER BY t.created_at DESC
       LIMIT 100`,
      params,
    );
  }

  async listFines(ctx: AuthCtx, hostelId?: string) {
    if (hostelId) await this.assertHostelAccess(ctx, hostelId);
    const allowed = await this.getAccessibleHostelIds(ctx);
    const params: unknown[] = [ctx.tenantId];
    let clause = '';
    if (hostelId) {
      clause = 'AND f.hostel_id = $2';
      params.push(hostelId);
    } else if (allowed) {
      clause = 'AND f.hostel_id = ANY($2::uuid[])';
      params.push(allowed);
    }
    return this.db.query(
      `SELECT f.*, u.name AS student_name, h.hostel_name
       FROM operations_hostel_fines f
       JOIN users u ON u.user_id = f.student_user_id
       LEFT JOIN operations_hostels h ON h.hostel_id = f.hostel_id
       WHERE f.tenant_id = $1 ${clause}
       ORDER BY f.reported_at DESC`,
      params,
    );
  }

  async createFine(
    ctx: AuthCtx,
    dto: {
      student_user_id: string;
      hostel_id: string;
      item_description: string;
      damage_severity?: string;
      amount: number;
    },
  ) {
    await this.assertHostelAccess(ctx, dto.hostel_id);
    const academicYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const demand = await this.finance.createDemand(
      {
        student_user_id: dto.student_user_id,
        fee_head: 'HOSTEL_DAMAGE',
        academic_year: academicYear,
        total_amount: dto.amount,
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        fee_breakup: { item: dto.item_description, severity: dto.damage_severity },
      },
      ctx.tenantId,
    );

    const [fine] = await this.db.query(
      `INSERT INTO operations_hostel_fines (
        tenant_id, student_user_id, hostel_id, item_description, damage_severity,
        amount, status, finance_demand_id, reported_by_user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8)
      RETURNING *`,
      [
        ctx.tenantId,
        dto.student_user_id,
        dto.hostel_id,
        dto.item_description,
        dto.damage_severity ?? 'MEDIUM',
        dto.amount,
        demand.demand_id,
        ctx.userId,
      ],
    );
    return { fine, finance_demand: demand };
  }

  async getMessMenu(ctx: AuthCtx) {
    const [menu] = await this.db.query(
      `SELECT * FROM operations_mess_menus WHERE tenant_id = $1
       ORDER BY week_start_date DESC LIMIT 1`,
      [ctx.tenantId],
    );
    return menu ?? null;
  }

  async saveMessMenu(
    ctx: AuthCtx,
    dto: {
      week_start_date: string;
      week_end_date: string;
      meal_plan: Record<string, unknown>;
      special_notes?: string;
      alternative_options?: string;
    },
  ) {
    const [menu] = await this.db.query(
      `INSERT INTO operations_mess_menus (tenant_id, week_start_date, week_end_date, meal_plan, special_notes, alternative_options)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        ctx.tenantId,
        dto.week_start_date,
        dto.week_end_date,
        JSON.stringify(dto.meal_plan),
        dto.special_notes ?? null,
        dto.alternative_options ?? null,
      ],
    );
    return menu;
  }

  async sendBroadcast(
    ctx: AuthCtx,
    dto: { title: string; message: string; hostel_ids: string[]; send_email: boolean; send_sms: boolean },
  ) {
    for (const hid of dto.hostel_ids) {
      await this.assertHostelAccess(ctx, hid);
    }
    const [row] = await this.db.query(
      `INSERT INTO operations_hostel_broadcasts (tenant_id, sender_user_id, title, message, hostel_ids, send_email, send_sms)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.tenantId, ctx.userId, dto.title, dto.message, dto.hostel_ids, dto.send_email, dto.send_sms],
    );

    const students = await this.db.query<Array<{ user_id: string }>>(
      `SELECT DISTINCT a.student_user_id AS user_id
       FROM hostel_allocations a
       JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       WHERE a.status = 'ACTIVE' AND r.hostel_id = ANY($1::uuid[])`,
      [dto.hostel_ids],
    );

    for (const s of students) {
      await this.falconNotify.create({
        tenantId: ctx.tenantId,
        userId: s.user_id,
        title: dto.title,
        message: dto.message,
        category: 'HOSTEL',
        actionLink: '/student/hostel',
      });
    }

    this.gateway.emitToTenant(ctx.tenantId, 'hostel.broadcast', { broadcast_id: row.broadcast_id, title: dto.title });
    return row;
  }

  async listMasterData(ctx: AuthCtx, category?: string) {
    const params: unknown[] = [ctx.tenantId];
    let clause = '';
    if (category) {
      clause = 'AND category = $2';
      params.push(category);
    }
    return this.db.query(
      `SELECT * FROM operations_hostel_master_data WHERE tenant_id = $1 ${clause} ORDER BY category, label`,
      params,
    );
  }

  async upsertMasterData(ctx: AuthCtx, dto: { category: string; label: string; meta?: Record<string, unknown> }) {
    const [row] = await this.db.query(
      `INSERT INTO operations_hostel_master_data (tenant_id, category, label, meta)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, category, label) DO UPDATE SET meta = EXCLUDED.meta
       RETURNING *`,
      [ctx.tenantId, dto.category, dto.label, JSON.stringify(dto.meta ?? {})],
    );
    return row;
  }

  async listRolePermissions(ctx: AuthCtx) {
    return this.db.query(
      `SELECT * FROM operations_hostel_role_permissions WHERE tenant_id = $1 ORDER BY role_name, permission_key`,
      [ctx.tenantId],
    );
  }

  async setRolePermission(ctx: AuthCtx, dto: { role_name: string; permission_key: string; allowed: boolean }) {
    const [row] = await this.db.query(
      `INSERT INTO operations_hostel_role_permissions (tenant_id, role_name, permission_key, allowed)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, role_name, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed
       RETURNING *`,
      [ctx.tenantId, dto.role_name, dto.permission_key, dto.allowed],
    );
    return row;
  }

  async transferStudent(
    ctx: AuthCtx,
    dto: { student_user_id: string; room_id: number; bed_label: string; hostel_id: string },
  ) {
    await this.assertHostelAccess(ctx, dto.hostel_id);
    const [bed] = await this.db.query<Array<{ bed_id: string }>>(
      `SELECT b.bed_id FROM operations_hostel_beds b
       JOIN operations_hostel_rooms r ON r.room_id = b.room_id
       WHERE b.room_id = $1 AND b.bed_label = $2 AND b.status = 'AVAILABLE' AND r.hostel_id = $3`,
      [dto.room_id, dto.bed_label, dto.hostel_id],
    );
    if (!bed) throw new BadRequestException('Bed not available');

    await this.db.query(
      `UPDATE hostel_allocations SET room_id = $2, bed_number = $3, ops_bed_id = $4, updated_at = NOW()
       WHERE student_user_id = $1`,
      [dto.student_user_id, dto.room_id, dto.bed_label, bed.bed_id],
    );
    await this.db.query(`UPDATE operations_hostel_beds SET status = 'OCCUPIED' WHERE bed_id = $1`, [bed.bed_id]);
    return { ok: true };
  }

  async evictStudent(ctx: AuthCtx, studentUserId: string) {
    const [alloc] = await this.db.query<Array<{ room_id: number; ops_bed_id: string }>>(
      `SELECT a.room_id, a.ops_bed_id FROM hostel_allocations a
       JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       WHERE a.student_user_id = $1`,
      [studentUserId],
    );
    if (alloc?.ops_bed_id) {
      await this.db.query(`UPDATE operations_hostel_beds SET status = 'AVAILABLE' WHERE bed_id = $1`, [
        alloc.ops_bed_id,
      ]);
    }
    await this.db.query(
      `UPDATE hostel_allocations SET status = 'VACATED', end_date = CURRENT_DATE, updated_at = NOW()
       WHERE student_user_id = $1`,
      [studentUserId],
    );
    if (alloc) {
      await this.db.query(
        `UPDATE operations_hostel_rooms SET occupied = GREATEST(0, occupied - 1) WHERE room_id = $1`,
        [alloc.room_id],
      );
    }
    return { evicted: true };
  }

  async approveHostelRequest(ctx: AuthCtx, requestId: string) {
    const [req] = await this.db.query<Array<{ student_user_id: string; request_type: string; payload: unknown }>>(
      `SELECT * FROM hostel_requests WHERE request_id = $1`,
      [requestId],
    );
    if (!req) throw new NotFoundException('Request not found');
    const token = randomBytes(24).toString('hex');
    await this.db.query(
      `UPDATE hostel_requests SET status = 'APPROVED', approved_at = NOW(), qr_token = $2 WHERE request_id = $1`,
      [requestId, token],
    );
    const [alloc] = await this.db.query<Array<{ hostel_id: string }>>(
      `SELECT h.hostel_id FROM hostel_allocations a
       JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       JOIN operations_hostels h ON h.hostel_id = r.hostel_id
       WHERE a.student_user_id = $1`,
      [req.student_user_id],
    );
    this.broadcastGatePass(ctx, {
      request_id: requestId,
      status: 'APPROVED',
      hostel_id: alloc?.hostel_id,
    });
    return { request_id: requestId, status: 'APPROVED', qr_token: token };
  }

  async createLeave(
    ctx: AuthCtx,
    dto: {
      student_user_id: string;
      hostel_id: string;
      leave_type: string;
      purpose?: string;
      from_date: string;
      to_date: string;
    },
  ) {
    await this.assertHostelAccess(ctx, dto.hostel_id);
    const [row] = await this.db.query(
      `INSERT INTO operations_hostel_leaves (student_user_id, hostel_id, leave_type, purpose, from_date, to_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [dto.student_user_id, dto.hostel_id, dto.leave_type, dto.purpose, dto.from_date, dto.to_date],
    );
    this.gateway.emitToHostel(dto.hostel_id, 'leave.created', row);
    return row;
  }
}
