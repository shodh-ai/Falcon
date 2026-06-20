import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
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
  ) {
    const slot = await this.dataSource.query(
      `SELECT t.*, c.course_id FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.timetable_id = $1 AND t.tenant_id = $2 AND t.faculty_user_id = $3`,
      [dto.timetable_id, tenantId, absentFacultyId],
    );
    if (!slot[0])
      throw new NotFoundException(
        'Timetable slot not found for your teaching schedule',
      );

    const rows = await this.dataSource.query(
      `INSERT INTO academic_proxy_requests (
         tenant_id, timetable_id, absent_faculty_id, proxy_faculty_id, course_id,
         date_of_proxy, reason, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_HOD_APPROVAL')
       RETURNING *`,
      [
        tenantId,
        dto.timetable_id,
        absentFacultyId,
        dto.proxy_faculty_id,
        slot[0].course_id,
        dto.date_of_proxy,
        dto.reason ?? null,
      ],
    );

    this.notify.approvalRequired({
      tenantId,
      userId: dto.proxy_faculty_id,
      title: 'Proxy teaching request',
      message: `You have been proposed as alternate faculty for a class on ${dto.date_of_proxy}. Awaiting HOD approval.`,
      actionLink: '/faculty/timetable',
      requestType: 'PROXY_TEACHING',
    });

    return rows[0];
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
    if (!deptIds.length) return [];

    return this.dataSource.query(
      `SELECT p.proxy_id, p.date_of_proxy, p.status, p.reason,
              c.course_code, c.course_name,
              af.name AS absent_faculty_name, pf.name AS proxy_faculty_name,
              t.start_time, t.end_time, t.room
       FROM academic_proxy_requests p
       INNER JOIN users af ON af.user_id = p.absent_faculty_id
       INNER JOIN users pf ON pf.user_id = p.proxy_faculty_id
       LEFT JOIN academic_timetables t ON t.timetable_id = p.timetable_id
       LEFT JOIN academic_courses c ON c.course_id = p.course_id
       WHERE p.tenant_id = $1 AND p.status = 'PENDING_HOD_APPROVAL'
         AND af.dept_id = ANY($2::int[])
       ORDER BY p.date_of_proxy ASC`,
      [tenantId, deptIds],
    );
  }

  async actOnProxyRequest(
    hodUserId: string,
    tenantId: string,
    proxyId: string,
    action: 'APPROVE' | 'REJECT',
    remarks?: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT p.*, af.dept_id AS faculty_dept_id, af.name AS absent_name, pf.name AS proxy_name
       FROM academic_proxy_requests p
       INNER JOIN users af ON af.user_id = p.absent_faculty_id
       INNER JOIN users pf ON pf.user_id = p.proxy_faculty_id
       WHERE p.proxy_id = $1 AND p.tenant_id = $2`,
      [proxyId, tenantId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Proxy request not found');
    if (row.status !== 'PENDING_HOD_APPROVAL')
      throw new BadRequestException('Already processed');

    const deptRows = await this.dataSource.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const hod = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE user_id = $1`,
      [hodUserId],
    );
    const deptIds = new Set<number>([
      ...deptRows.map((r: { dept_id: number }) => Number(r.dept_id)),
      ...(hod[0]?.dept_id ? [hod[0].dept_id] : []),
    ]);
    if (!deptIds.has(Number(row.faculty_dept_id))) {
      throw new ForbiddenException(
        'HOD can act only on requests from their department',
      );
    }

    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await this.dataSource.query(
      `UPDATE academic_proxy_requests SET status = $3, hod_remarks = $4 WHERE proxy_id = $1 AND tenant_id = $2`,
      [proxyId, tenantId, status, remarks?.trim() ?? null],
    );

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
