import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

@Injectable()
export class AcademicProxyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async listLecturesForLeaveDates(
    facultyUserId: string,
    tenantId: string,
    startDate: string,
    endDate: string,
  ) {
    this.requireDate(startDate);
    this.requireDate(endDate);
    const duration = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000;
    if (duration < 0 || duration > 31) throw new BadRequestException('Choose a date range of up to 32 days');
    const rows = await this.dataSource.query(
      `SELECT t.timetable_id, t.course_id, t.day_of_week, t.start_time, t.end_time, t.room,
              c.course_code, c.course_name,
              d::date AS lecture_date
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       CROSS JOIN generate_series($3::date, $4::date, '1 day'::interval) AS d
       WHERE t.tenant_id = $1
         AND t.faculty_user_id = $2
         AND t.day_of_week = CASE WHEN EXTRACT(ISODOW FROM d::date) = 0 THEN 7 ELSE EXTRACT(ISODOW FROM d::date)::int END
       ORDER BY d::date ASC, t.start_time ASC`,
      [tenantId, facultyUserId, startDate, endDate],
    );
    return rows;
  }

  async listDepartmentFacultyForProxy(tenantId: string, facultyUserId: string) {
    const dept = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [facultyUserId, tenantId],
    );
    const deptId = dept[0]?.dept_id;
    if (!deptId) return [];

    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.dept_id = $2
         AND u.user_id != $3
         AND u.is_active = true
         AND r.role_name IN ('Faculty', 'HOD', 'Dean')
       ORDER BY u.name ASC`,
      [tenantId, deptId, facultyUserId],
    );
  }

  async createProxyRequest(
    absentFacultyId: string,
    tenantId: string,
    dto: {
      timetable_id: string;
      proxy_faculty_id: string;
      date_of_proxy: string;
      reason?: string;
    },
    requestedByUserId = absentFacultyId,
  ) {
    const date = this.requireDate(dto.date_of_proxy);
    const row = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        [`class-move:${tenantId}:${date}`]);
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`proxy:${tenantId}:${dto.timetable_id}:${date}`]);
      const [slot] = await manager.query<Array<{
        timetable_id: string; course_id: string; start_time: string; end_time: string;
        day_of_week: number; faculty_user_id: string;
      }>>(
        `SELECT t.timetable_id, t.course_id, t.start_time, t.end_time,
                t.day_of_week, t.faculty_user_id
         FROM academic_timetables t
         WHERE t.timetable_id=$1::uuid AND t.tenant_id=$2 AND t.faculty_user_id=$3
           AND t.deleted_at IS NULL
           AND (t.valid_from IS NULL OR t.valid_from <= $4::date)
           AND (t.valid_to IS NULL OR t.valid_to >= $4::date)`,
        [dto.timetable_id, tenantId, absentFacultyId, date],
      );
      if (!slot) throw new NotFoundException('Timetable slot not found for this faculty and date');
      const isoDay = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
      if (isoDay !== slot.day_of_week) throw new BadRequestException('The date does not match this class slot');
      const existing = await manager.query(
        `SELECT 1 FROM academic_proxy_requests
         WHERE tenant_id=$1 AND timetable_id=$2::uuid AND date_of_proxy=$3::date
           AND status IN ('PENDING_SUBSTITUTE_ACCEPTANCE','PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
        [tenantId, dto.timetable_id, date],
      );
      if (existing.length) throw new BadRequestException('This class already has a live substitute request');
      const moved = await manager.query(
        `SELECT 1 FROM academic_class_moves WHERE tenant_id=$1 AND source_timetable_id=$2::uuid
           AND source_date=$3::date AND status IN ('PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
        [tenantId,dto.timetable_id,date],
      );
      if (moved.length) throw new BadRequestException('This class already has a pending or approved time change');
      const recorded = await manager.query(
        `SELECT 1 FROM course_attendance_logs
         WHERE tenant_id=$1 AND timetable_id=$2::uuid AND date=$3::date LIMIT 1`,
        [tenantId, dto.timetable_id, date],
      );
      if (recorded.length) throw new BadRequestException('Attendance has already been recorded for this class');
      await this.assertCandidateAvailable(manager, tenantId, absentFacultyId, dto.proxy_faculty_id, date, slot);
      const rows = await manager.query(
        `INSERT INTO academic_proxy_requests (
           tenant_id, timetable_id, absent_faculty_id, proxy_faculty_id, course_id,
           date_of_proxy, reason, requested_by_user_id, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_SUBSTITUTE_ACCEPTANCE')
         RETURNING *`,
        [tenantId, dto.timetable_id, absentFacultyId, dto.proxy_faculty_id,
          slot.course_id, date, dto.reason?.trim() || null, requestedByUserId],
      );
      return rows[0];
    });

    this.notify.approvalRequired({
      tenantId,
      userId: dto.proxy_faculty_id,
      title: 'Proxy teaching request',
      message: `You have been proposed to cover a class on ${date}. Accept or decline before HOD approval.`,
      actionLink: '/faculty/timetable',
      requestType: 'PROXY_TEACHING',
    });

    return row;
  }

  private requireDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') ||
        Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Class date must be a valid YYYY-MM-DD value');
    }
    return value;
  }

  private async assertCandidateAvailable(
    manager: EntityManager,
    tenantId: string,
    absentFacultyId: string,
    candidateId: string,
    date: string,
    slot: { timetable_id: string; start_time: string; end_time: string },
  ) {
    if (!candidateId || candidateId === absentFacultyId) {
      throw new BadRequestException('Select a different substitute faculty');
    }
    const [candidate] = await manager.query<Array<{ user_id: string }>>(
      `SELECT proxy.user_id FROM users proxy
       JOIN users absent ON absent.user_id=$3 AND absent.tenant_id=$1
       JOIN roles r ON r.role_id=proxy.role_id
       WHERE proxy.user_id=$2 AND proxy.tenant_id=$1 AND proxy.is_active=true
         AND proxy.dept_id=absent.dept_id AND r.role_name IN ('Faculty','HOD','Dean')`,
      [tenantId, candidateId, absentFacultyId],
    );
    if (!candidate) throw new BadRequestException('Substitute must be an active faculty member in the same department');
    const onLeave = await manager.query(
      `SELECT 1 FROM staff_leave_requests WHERE tenant_id=$1 AND staff_user_id=$2
         AND status IN ('HOD_APPROVED','HR_APPROVED')
         AND start_date<=$3::date AND end_date>=$3::date LIMIT 1`,
      [tenantId,candidateId,date],
    );
    if (onLeave.length) throw new BadRequestException('Substitute faculty is on approved leave that day');
    const conflict = await manager.query(
      `SELECT 1 FROM academic_timetables t
       WHERE t.tenant_id=$1 AND t.faculty_user_id=$2
         AND t.day_of_week=EXTRACT(ISODOW FROM $3::date)::int
         AND t.timetable_id<>$4::uuid AND t.deleted_at IS NULL
         AND (t.valid_from IS NULL OR t.valid_from<=$3::date)
         AND (t.valid_to IS NULL OR t.valid_to>=$3::date)
         AND t.start_time<$6::time AND t.end_time>$5::time
         AND NOT EXISTS (SELECT 1 FROM academic_class_moves m
           WHERE m.tenant_id=t.tenant_id AND m.source_timetable_id=t.timetable_id
             AND m.source_date=$3::date AND m.status='APPROVED')
       UNION ALL
       SELECT 1 FROM academic_proxy_requests p
       JOIN academic_timetables t ON t.timetable_id=p.timetable_id AND t.tenant_id=p.tenant_id
       WHERE p.tenant_id=$1 AND p.proxy_faculty_id=$2 AND p.date_of_proxy=$3::date
         AND p.timetable_id<>$4::uuid AND p.status='APPROVED'
         AND t.start_time<$6::time AND t.end_time>$5::time
       UNION ALL
       SELECT 1 FROM academic_class_moves m
       WHERE m.tenant_id=$1 AND m.original_faculty_id=$2
         AND m.target_date=$3::date AND m.source_timetable_id<>$4::uuid
         AND m.status='APPROVED'
         AND m.target_start_time<$6::time AND m.target_end_time>$5::time
       LIMIT 1`,
      [tenantId, candidateId, date, slot.timetable_id, slot.start_time, slot.end_time],
    );
    if (conflict.length) throw new BadRequestException('Substitute faculty has another class in this time slot');
  }

  async listMyProxyRequests(facultyUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT p.*, c.course_code, c.course_name,
              af.name AS absent_faculty_name, pf.name AS proxy_faculty_name
       FROM academic_proxy_requests p
       LEFT JOIN academic_courses c ON c.course_id = p.course_id
       LEFT JOIN users af ON af.user_id = p.absent_faculty_id
       LEFT JOIN users pf ON pf.user_id = p.proxy_faculty_id
       WHERE p.tenant_id = $1 AND (p.absent_faculty_id = $2 OR p.proxy_faculty_id = $2)
       ORDER BY p.created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async listDepartmentFacultyForHod(hodUserId: string, tenantId: string) {
    return this.dataSource.query<Array<{ user_id: string; name: string; email: string }>>(
      `SELECT u.user_id,u.name,u.official_email AS email FROM users u
       JOIN roles r ON r.role_id=u.role_id
       WHERE u.tenant_id=$1 AND u.is_active=true AND r.role_name IN ('Faculty','HOD','Dean')
         AND u.dept_id IN (
           SELECT dept_id FROM departments WHERE tenant_id=$1 AND hod_user_id=$2
           UNION SELECT dept_id FROM users WHERE tenant_id=$1 AND user_id=$2
         )
       ORDER BY u.name`,
      [tenantId, hodUserId],
    );
  }

  async createProxyRequestByHod(
    hodUserId: string,
    tenantId: string,
    dto: { absent_faculty_id: string; timetable_id: string; proxy_faculty_id: string;
      date_of_proxy: string; reason?: string },
  ) {
    const faculty = await this.listDepartmentFacultyForHod(hodUserId, tenantId);
    if (!faculty.some((row) => row.user_id === dto.absent_faculty_id)) {
      throw new ForbiddenException('HOD can arrange cover only for their department');
    }
    return this.createProxyRequest(dto.absent_faculty_id, tenantId, dto, hodUserId);
  }

  async listDepartmentLecturesForHod(
    hodUserId: string,
    tenantId: string,
    facultyId: string,
    startDate: string,
    endDate: string,
  ) {
    const faculty = await this.listDepartmentFacultyForHod(hodUserId, tenantId);
    if (!faculty.some((row) => row.user_id === facultyId)) {
      throw new ForbiddenException('Faculty is outside your department');
    }
    return this.listLecturesForLeaveDates(facultyId, tenantId, startDate, endDate);
  }

  async actOnProxyOffer(
    substituteId: string,
    tenantId: string,
    proxyId: string,
    action: 'ACCEPT' | 'DECLINE',
  ) {
    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      throw new BadRequestException('Action must be ACCEPT or DECLINE');
    }
    const row = await this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query<Array<{
        proxy_faculty_id: string; absent_faculty_id: string; timetable_id: string;
        date_of_proxy: string; proxy_date: string; course_id: string; status: string;
      }>>(
        `SELECT *, date_of_proxy::text AS proxy_date FROM academic_proxy_requests
         WHERE tenant_id=$1 AND proxy_id=$2::uuid FOR UPDATE`,
        [tenantId, proxyId],
      );
      if (!current) throw new NotFoundException('Substitute request not found');
      if (current.proxy_faculty_id !== substituteId) throw new ForbiddenException('Only the proposed substitute can respond');
      if (current.status !== 'PENDING_SUBSTITUTE_ACCEPTANCE') {
        throw new BadRequestException('This substitute offer has already been answered');
      }
      if (action === 'ACCEPT') {
        const [slot] = await manager.query<Array<{
          timetable_id: string; start_time: string; end_time: string;
        }>>(
          `SELECT timetable_id,start_time,end_time FROM academic_timetables
           WHERE tenant_id=$1 AND timetable_id=$2::uuid AND course_id=$3
             AND faculty_user_id=$4 AND deleted_at IS NULL`,
          [tenantId, current.timetable_id, current.course_id, current.absent_faculty_id],
        );
        if (!slot) throw new BadRequestException('Original class is no longer scheduled');
        await this.assertCandidateAvailable(manager, tenantId, current.absent_faculty_id,
          substituteId, current.proxy_date, slot);
      }
      const [updated] = await manager.query(
        `UPDATE academic_proxy_requests
         SET status=$3, accepted_at=CASE WHEN $4::boolean THEN NOW() ELSE NULL END,
             updated_at=NOW()
         WHERE tenant_id=$1 AND proxy_id=$2::uuid RETURNING *`,
        [tenantId, proxyId,
          action === 'ACCEPT' ? 'PENDING_HOD_APPROVAL' : 'REJECTED',
          action === 'ACCEPT'],
      );
      return updated;
    });
    if (action === 'ACCEPT') {
      const [owner] = await this.dataSource.query<Array<{
        hod_user_id: string | null; dean_user_id: string | null; requested_by_user_id: string | null;
      }>>(
        `SELECT d.hod_user_id,s.dean_user_id,p.requested_by_user_id
         FROM academic_proxy_requests p
         JOIN users u ON u.user_id=p.absent_faculty_id AND u.tenant_id=p.tenant_id
         LEFT JOIN departments d ON d.dept_id=u.dept_id AND d.tenant_id=u.tenant_id
         LEFT JOIN schools s ON s.school_id=d.school_id
         WHERE p.tenant_id=$1 AND p.proxy_id=$2::uuid`,
        [tenantId, proxyId],
      );
      const approverId = owner?.requested_by_user_id === owner?.hod_user_id
        ? owner?.dean_user_id : owner?.hod_user_id;
      if (approverId) this.notify.approvalRequired({
        tenantId, userId: approverId,
        title: 'Substitute class awaits approval',
        message: 'The proposed substitute accepted. Review the dated class and approve or reject.',
        actionLink: '/hod/approvals/proxy',
        requestType: 'PROXY_TEACHING',
      });
    }
    return row;
  }

  async listHodPendingProxies(hodUserId: string, tenantId: string) {
    const deptRows = await this.dataSource.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    const deptIds = Array.from(
      new Set<number>([
        ...deptRows.map((r: { dept_id: number }) => Number(r.dept_id)),
        ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
      ]),
    );
    const [actor] = await this.dataSource.query<Array<{ role_name: string }>>(
      `SELECT r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true`,
      [tenantId,hodUserId],
    );
    if (!actor || !['HOD','Dean','SuperAdmin'].includes(actor.role_name)) {
      throw new ForbiddenException('Academic approver role required');
    }

    return this.dataSource.query(
      `SELECT p.proxy_id, p.date_of_proxy, p.status, p.reason,
              c.course_code, c.course_name,
              af.name AS absent_faculty_name, pf.name AS proxy_faculty_name,
              t.start_time, t.end_time, t.room
       FROM academic_proxy_requests p
       INNER JOIN users af ON af.user_id = p.absent_faculty_id
       INNER JOIN users pf ON pf.user_id = p.proxy_faculty_id
       LEFT JOIN departments d ON d.dept_id=af.dept_id AND d.tenant_id=p.tenant_id
       LEFT JOIN schools s ON s.school_id=d.school_id
       LEFT JOIN academic_timetables t ON t.timetable_id = p.timetable_id
       LEFT JOIN academic_courses c ON c.course_id = p.course_id
       WHERE p.tenant_id = $1 AND p.status = 'PENDING_HOD_APPROVAL'
         AND ($3::boolean OR af.dept_id = ANY($2::int[])
           OR ($4::boolean AND s.dean_user_id=$5::uuid))
       ORDER BY p.date_of_proxy ASC`,
      [tenantId, deptIds, actor.role_name === 'SuperAdmin',
        actor.role_name === 'Dean', hodUserId],
    );
  }

  async actOnProxyRequest(
    hodUserId: string,
    tenantId: string,
    proxyId: string,
    action: 'APPROVE' | 'REJECT',
    remarks?: string,
  ) {
    if (!['APPROVE', 'REJECT'].includes(action)) throw new BadRequestException('Invalid HOD action');
    const row = await this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query<Array<{
        faculty_dept_id: number; absent_faculty_id: string; proxy_faculty_id: string;
        timetable_id: string; course_id: string; date_of_proxy: string; proxy_date: string;
        absent_name: string; proxy_name: string; status: string; accepted_at: string | null;
        requested_by_user_id: string | null;
      }>>(
        `SELECT p.*, p.date_of_proxy::text AS proxy_date,
                af.dept_id AS faculty_dept_id, af.name AS absent_name, pf.name AS proxy_name
         FROM academic_proxy_requests p
         JOIN users af ON af.user_id=p.absent_faculty_id AND af.tenant_id=p.tenant_id
         JOIN users pf ON pf.user_id=p.proxy_faculty_id AND pf.tenant_id=p.tenant_id
         WHERE p.proxy_id=$1::uuid AND p.tenant_id=$2 FOR UPDATE OF p`,
        [proxyId, tenantId],
      );
      if (!current) throw new NotFoundException('Proxy request not found');
      if (current.status !== 'PENDING_HOD_APPROVAL') throw new BadRequestException('Request is not awaiting HOD approval');
      const [scope] = await manager.query(
        `SELECT 1 FROM users h JOIN roles r ON r.role_id=h.role_id
         LEFT JOIN departments d ON d.tenant_id=h.tenant_id AND d.dept_id=$3::int
         LEFT JOIN schools s ON s.school_id=d.school_id
         WHERE h.user_id=$1 AND h.tenant_id=$2
           AND h.is_active=true AND r.role_name IN ('HOD','Dean','SuperAdmin')
           AND (r.role_name='SuperAdmin'
             OR (r.role_name='Dean' AND s.dean_user_id=$1)
             OR (r.role_name='HOD' AND (d.hod_user_id=$1 OR h.dept_id=$3::int)))`,
        [hodUserId, tenantId, current.faculty_dept_id],
      );
      if (!scope) throw new ForbiddenException('HOD can act only on requests from their department');
      if (action === 'APPROVE') {
        if (current.requested_by_user_id === hodUserId) {
          throw new ForbiddenException('The HOD who proposed cover cannot approve their own request');
        }
        if (!current.accepted_at) throw new BadRequestException('Substitute must accept before HOD approval');
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',
          [`class-move:${tenantId}:${current.proxy_date}`]);
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`proxy:${tenantId}:${current.timetable_id}:${current.proxy_date}`]);
        const moved = await manager.query(
          `SELECT 1 FROM academic_class_moves WHERE tenant_id=$1 AND source_timetable_id=$2::uuid
             AND source_date=$3::date AND status IN ('PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
          [tenantId,current.timetable_id,current.proxy_date],
        );
        if (moved.length) throw new BadRequestException('Resolve the class move before approving substitution');
        const [slot] = await manager.query<Array<{
          timetable_id: string; start_time: string; end_time: string;
        }>>(
          `SELECT timetable_id,start_time,end_time FROM academic_timetables
           WHERE tenant_id=$1 AND timetable_id=$2::uuid AND course_id=$3
             AND faculty_user_id=$4 AND deleted_at IS NULL
             AND (valid_from IS NULL OR valid_from<=$5::date)
             AND (valid_to IS NULL OR valid_to>=$5::date)`,
          [tenantId, current.timetable_id, current.course_id,
            current.absent_faculty_id, current.proxy_date],
        );
        if (!slot) throw new BadRequestException('Original class is no longer scheduled');
        const attendance = await manager.query(
          `SELECT 1 FROM course_attendance_logs
           WHERE tenant_id=$1 AND timetable_id=$2::uuid AND date=$3::date LIMIT 1`,
          [tenantId, current.timetable_id, current.proxy_date],
        );
        if (attendance.length) throw new BadRequestException('Attendance already exists for this class; cover cannot be changed');
        await this.assertCandidateAvailable(manager, tenantId, current.absent_faculty_id,
          current.proxy_faculty_id, current.proxy_date, slot);
      }
      await manager.query(
        `UPDATE academic_proxy_requests
         SET status=$3, hod_remarks=$4, decided_by_user_id=$5::uuid, updated_at=NOW()
         WHERE proxy_id=$1::uuid AND tenant_id=$2`,
        [proxyId, tenantId, action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          remarks?.trim() ?? null, hodUserId],
      );
      return current;
    });

    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    this.notify.leaveApproved({
      tenantId,
      userId: row.absent_faculty_id,
      title:
        action === 'APPROVE'
          ? 'Proxy arrangement approved'
          : 'Proxy arrangement rejected',
      message:
        action === 'APPROVE'
          ? `${row.proxy_name} is approved to cover your class on ${row.date_of_proxy}.`
          : `Your proxy request for ${row.date_of_proxy} was rejected.`,
      actionLink: '/faculty/timetable',
    });
    this.notify.leaveApproved({
      tenantId,
      userId: row.proxy_faculty_id,
      title:
        action === 'APPROVE'
          ? 'Proxy teaching approved'
          : 'Proxy teaching declined',
      message:
        action === 'APPROVE'
          ? `You may mark attendance for ${row.absent_name}'s class on ${row.date_of_proxy}.`
          : `Proxy request for ${row.date_of_proxy} was not approved.`,
      actionLink: '/faculty/attendance',
    });

    return { proxy_id: proxyId, status };
  }

  async hasApprovedProxyForCourse(
    proxyFacultyId: string,
    tenantId: string,
    courseId: string,
    date: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM academic_proxy_requests
       WHERE tenant_id = $1 AND proxy_faculty_id = $2 AND course_id = $3
         AND date_of_proxy = $4::date AND status = 'APPROVED' LIMIT 1`,
      [tenantId, proxyFacultyId, courseId, date],
    );
    return rows.length > 0;
  }
}
