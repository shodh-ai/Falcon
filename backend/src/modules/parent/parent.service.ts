import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { TransportService } from '../transport/transport.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';
const UNIVERSITY_PAN = 'AAECS1234F';

@Injectable()
export class ParentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly transport: TransportService,
    private readonly notify: NotificationEmitterService,
  ) {}

  async requestOtp(mobile: string) {
    const normalized = mobile.trim();
    const links = await this.dataSource.query(
      `SELECT link_id, parent_name FROM parent_student_links WHERE parent_mobile = $1`,
      [normalized],
    );
    if (!links.length) {
      throw new UnauthorizedException('Mobile not registered with any student');
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(otp, 10);
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await this.dataSource.query(
      `UPDATE parent_student_links SET otp_hash = $2, otp_expires_at = $3 WHERE parent_mobile = $1`,
      [normalized, hash, expires.toISOString()],
    );

    await this.dataSource.query(
      `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, payload)
       VALUES ('a0000000-0000-4000-8000-000000000001', 'WHATSAPP', 'parent_otp', $1::jsonb)`,
      [JSON.stringify({ to: normalized, message: `Your Falcon Parent OTP is ${otp}`, provider: 'MSG91' })],
    );

    const devOtp = this.config.get('NODE_ENV') !== 'production' ? otp : undefined;
    return { mobile: normalized, otp_sent: true, channel: 'WHATSAPP_SMS', dev_otp: devOtp };
  }

  async verifyOtp(mobile: string, otp: string) {
    const normalized = mobile.trim();
    const rows = await this.dataSource.query(
      `SELECT link_id, parent_name, otp_hash, otp_expires_at, tenant_id
       FROM parent_student_links WHERE parent_mobile = $1 LIMIT 1`,
      [normalized],
    );
    const row = rows[0] as {
      link_id: string;
      parent_name: string;
      otp_hash: string;
      otp_expires_at: string;
      tenant_id: string;
    };
    if (!row?.otp_hash) throw new UnauthorizedException('Request OTP first');
    if (new Date(row.otp_expires_at) < new Date()) throw new UnauthorizedException('OTP expired');

    const ok = await bcrypt.compare(otp, row.otp_hash);
    if (!ok) throw new UnauthorizedException('Invalid OTP');

    const token = this.jwt.sign({
      sub: row.link_id,
      email: `${normalized}@parent.local`,
      name: row.parent_name,
      role: 'Parent',
      roles: ['Parent'],
      primaryRole: 'Parent',
      tenantId: row.tenant_id ?? DEFAULT_TENANT,
      tenantSchema: 'public',
      authType: 'parent',
      parentMobile: normalized,
    });

    return {
      token,
      user: {
        user_id: row.link_id,
        name: row.parent_name,
        role: 'Parent',
        primaryRole: 'Parent',
        parent_mobile: normalized,
      },
    };
  }

  resolveMobile(reqUser: { parent_mobile?: string; auth_type?: string }, queryMobile?: string) {
    if (reqUser?.auth_type === 'parent' && reqUser.parent_mobile) return reqUser.parent_mobile;
    return queryMobile ?? '';
  }

  async assertChildLinked(parentMobile: string, studentUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM parent_student_links WHERE parent_mobile = $1 AND student_user_id = $2`,
      [parentMobile, studentUserId],
    );
    if (!rows[0]) throw new ForbiddenException('Not authorized to view this student');
  }

  async getChildOverview(parentMobile: string) {
    return {
      parent_mobile: parentMobile,
      children: await this.query(
        `SELECT l.student_user_id, u.name, u.official_email,
                COALESCE(sp.enrollment_number, sp.enrollment_no, sp.admission_number) AS enrollment_number,
                d.dept_name AS department
         FROM parent_student_links l
         JOIN users u ON u.user_id = l.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE l.parent_mobile = $1
         ORDER BY u.name`,
        [parentMobile],
      ),
    };
  }

  async getLiveFeed(parentMobile: string, studentUserId: string) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const [student] = await this.query<{ name: string }>(
      `SELECT name FROM users WHERE user_id = $1`,
      [studentUserId],
    );
    const childName = student?.name ?? 'Your child';

    type FeedItem = {
      id: string;
      type: 'attendance' | 'gate' | 'fee' | 'hostel_entry' | 'exam';
      tone: 'success' | 'danger' | 'warning' | 'info';
      message: string;
      timestamp: string;
      action_label?: string;
      action_href?: string;
    };

    const items: FeedItem[] = [];

    const attendance = await this.query<{
      session_date: string;
      status: string;
      created_at: string;
      course_name: string;
    }>(
      `SELECT ar.session_date, ar.status, ar.created_at,
              COALESCE(sub.subject_name, 'Class') AS course_name
       FROM academic_attendance_records ar
       LEFT JOIN academic_subjects sub ON sub.subject_id = ar.subject_id
       WHERE ar.student_user_id = $1
       ORDER BY ar.session_date DESC, ar.created_at DESC
       LIMIT 15`,
      [studentUserId],
    );

    for (const row of attendance) {
      const present = row.status === 'PRESENT' || row.status === 'LATE';
      items.push({
        id: `att-${row.session_date}-${row.course_name}`,
        type: 'attendance',
        tone: present ? 'success' : 'danger',
        message: `${childName}'s attendance marked ${present ? 'Present' : 'Absent'} in ${row.course_name}.`,
        timestamp: row.created_at ?? `${row.session_date}T09:00:00Z`,
      });
    }

    const gatePasses = await this.query<{
      pass_id: string;
      reason: string;
      status: string;
      exited_at: string | null;
      returned_at: string | null;
      created_at: string;
      hostel_name: string | null;
    }>(
      `SELECT gp.pass_id, gp.reason, gp.status, gp.exited_at, gp.returned_at, gp.created_at,
              h.hostel_name
       FROM operations_gate_passes gp
       LEFT JOIN hostel_allocations a ON a.student_user_id = gp.student_user_id AND a.status = 'ACTIVE'
       LEFT JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       LEFT JOIN operations_hostels h ON h.hostel_id = r.hostel_id
       WHERE gp.student_user_id = $1
       ORDER BY gp.created_at DESC
       LIMIT 10`,
      [studentUserId],
    );

    for (const gp of gatePasses) {
      if (gp.exited_at) {
        items.push({
          id: `gate-out-${gp.pass_id}`,
          type: 'gate',
          tone: 'info',
          message: `${childName} left ${gp.hostel_name ?? 'hostel'} gate (${gp.reason}).`,
          timestamp: gp.exited_at,
        });
      }
      if (gp.returned_at) {
        items.push({
          id: `gate-in-${gp.pass_id}`,
          type: 'hostel_entry',
          tone: 'success',
          message: `${childName} scanned Entry at ${gp.hostel_name ?? 'Hostel'} Gate.`,
          timestamp: gp.returned_at,
        });
      }
    }

    const fees = await this.getFeeDues(studentUserId);
    const now = Date.now();
    for (const fee of fees as Array<{
      demand_id: string;
      fee_head: string;
      total_amount: string;
      paid_amount: string;
      due_date: string;
      status: string;
    }>) {
      if (fee.status === 'PAID') continue;
      const due = Math.max(0, Number(fee.total_amount) - Number(fee.paid_amount ?? 0));
      if (due <= 0) continue;
      const dueMs = new Date(fee.due_date).getTime();
      const daysLeft = Math.ceil((dueMs - now) / (24 * 60 * 60 * 1000));
      if (daysLeft <= 14) {
        items.push({
          id: `fee-${fee.demand_id}`,
          type: 'fee',
          tone: daysLeft <= 3 ? 'danger' : 'warning',
          message: `Semester fee — ${fee.fee_head} (₹${due.toLocaleString('en-IN')}) is due in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'}.`,
          timestamp: new Date().toISOString(),
          action_label: 'Pay Now',
          action_href: '/parent/finance',
        });
      }
    }

    const reEvaluations = await this.query<{
      exam_application_id: string;
      subject_name: string;
      original_marks: string | null;
      revised_marks: string | null;
      published_at: string;
    }>(
      `SELECT a.exam_application_id, sub.subject_name, a.original_marks, a.revised_marks, a.published_at
       FROM exam_applications a
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       WHERE a.student_user_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND a.status = 'COMPLETED'
         AND a.published_at IS NOT NULL
       ORDER BY a.published_at DESC
       LIMIT 10`,
      [studentUserId],
    );

    for (const row of reEvaluations) {
      const original = row.original_marks != null ? Number(row.original_marks) : null;
      const revised = row.revised_marks != null ? Number(row.revised_marks) : null;
      const delta =
        original != null && revised != null
          ? ` (${original} → ${revised})`
          : revised != null
            ? ` (revised: ${revised})`
            : '';
      items.push({
        id: `reeval-${row.exam_application_id}`,
        type: 'exam',
        tone: 'success',
        message: `${childName}'s re-evaluation report for ${row.subject_name} is available${delta}.`,
        timestamp: row.published_at,
        action_label: 'View academics',
        action_href: '/parent/academics',
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { student_user_id: studentUserId, child_name: childName, feed: items.slice(0, 30) };
  }

  async getAttendanceForParent(parentMobile: string, studentUserId?: string) {
    const id = await this.resolveStudentId(parentMobile, studentUserId);
    return this.getAttendance(id);
  }

  async getMarksForParent(parentMobile: string, studentUserId?: string) {
    const id = await this.resolveStudentId(parentMobile, studentUserId);
    return this.getMarks(id);
  }

  async getFeeDuesForParent(parentMobile: string, studentUserId?: string) {
    const id = await this.resolveStudentId(parentMobile, studentUserId);
    return this.getFeeDues(id);
  }

  async getDisciplineForParent(parentMobile: string, studentUserId?: string) {
    const id = await this.resolveStudentId(parentMobile, studentUserId);
    const [academics, ufm, demeritSummary] = await Promise.all([
      this.getDiscipline(id),
      this.getUfmCases(id),
      this.getDemeritSummary(id),
    ]);
    return { disciplinary: academics, ufm_cases: ufm, demerit_summary: demeritSummary };
  }

  async getAcademicsSummary(parentMobile: string, studentUserId: string) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const marksProgression = await this.query(
      `SELECT c.course_code, c.course_name,
              MAX(m.marks_obtained) FILTER (WHERE m.exam_type IN ('MID_TERM', 'CAT1', 'INTERNAL')) AS mid_term,
              MAX(m.max_marks) FILTER (WHERE m.exam_type IN ('MID_TERM', 'CAT1', 'INTERNAL')) AS mid_max,
              MAX(m.marks_obtained) FILTER (WHERE m.exam_type IN ('END_TERM', 'CAT2')) AS end_term,
              MAX(m.max_marks) FILTER (WHERE m.exam_type IN ('END_TERM', 'CAT2')) AS end_max
       FROM academic_marks m
       JOIN academic_courses c ON c.course_id = m.course_id
       WHERE m.student_user_id = $1 AND m.status = 'PUBLISHED'
       GROUP BY c.course_code, c.course_name
       ORDER BY c.course_code`,
      [studentUserId],
    );

    const sgpaRows = await this.query<{ sgpa: string | null }>(
      `SELECT ROUND(
         SUM(e.grade_points * c.credits) FILTER (WHERE e.status = 'COMPLETED' AND e.grade_points IS NOT NULL)
         / NULLIF(SUM(c.credits) FILTER (WHERE e.status = 'COMPLETED' AND e.grade_points IS NOT NULL), 0),
       2)::text AS sgpa
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1`,
      [studentUserId],
    );

    const attendance = await this.getAttendance(studentUserId);

    const revaluationReports = await this.query(
      `SELECT a.exam_application_id,
              a.original_marks,
              a.revised_marks,
              a.report_notes,
              a.published_at,
              sub.subject_name,
              sub.subject_code
       FROM exam_applications a
       JOIN academic_subjects sub ON sub.subject_id = a.subject_id
       WHERE a.student_user_id = $1
         AND a.application_type = 'RE_EVALUATION'
         AND a.status = 'COMPLETED'
       ORDER BY a.published_at DESC NULLS LAST`,
      [studentUserId],
    );

    return {
      sgpa: sgpaRows[0]?.sgpa ?? null,
      marks_progression: marksProgression,
      attendance_summary: attendance,
      revaluation_reports: revaluationReports,
      exam_reports: await this.query(
        `SELECT r.report_id, r.exam_type, r.marks_obtained, r.max_marks, r.percent, r.grade,
                r.result_status, r.report_summary, r.declared_at, c.course_code, c.course_name
         FROM student_exam_reports r
         JOIN academic_courses c ON c.course_id = r.course_id
         WHERE r.student_user_id = $1
         ORDER BY r.declared_at DESC`,
        [studentUserId],
      ),
    };
  }

  async getProctorInfo(parentMobile: string, studentUserId: string) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const rows = await this.query(
      `SELECT m.mentorship_id, u.user_id AS proctor_user_id, u.name, u.official_email AS email,
              d.dept_name AS department
       FROM academic_mentorships m
       JOIN users u ON u.user_id = m.proctor_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE m.student_user_id = $1 AND m.is_active = true
       LIMIT 1`,
      [studentUserId],
    );

    const pending = await this.query(
      `SELECT meeting_id, status, requested_time, topic
       FROM mentorship_meetings
       WHERE student_user_id = $1 AND status = 'PENDING'
       ORDER BY created_at DESC LIMIT 1`,
      [studentUserId],
    );

    return {
      proctor: rows[0] ?? null,
      pending_meeting: pending[0] ?? null,
    };
  }

  async requestProctorMeeting(
    parentMobile: string,
    studentUserId: string,
    note?: string,
    preferredDate?: string,
  ) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const mentorshipRows = await this.query<{ proctor_user_id: string }>(
      `SELECT proctor_user_id FROM academic_mentorships
       WHERE student_user_id = $1 AND is_active = true LIMIT 1`,
      [studentUserId],
    );
    const proctorUserId = mentorshipRows[0]?.proctor_user_id;
    if (!proctorUserId) throw new NotFoundException('No proctor assigned to this student');

    const pending = await this.query(
      `SELECT 1 FROM mentorship_meetings WHERE student_user_id = $1 AND status = 'PENDING' LIMIT 1`,
      [studentUserId],
    );
    if (pending[0]) throw new BadRequestException('A meeting request is already pending');

    const [student] = await this.query<{ name: string; tenant_id: string }>(
      `SELECT name, tenant_id FROM users WHERE user_id = $1`,
      [studentUserId],
    );

    const requestedTime = preferredDate ? new Date(preferredDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(requestedTime.getTime())) {
      throw new BadRequestException('Invalid preferred meeting date');
    }

    const topic = `[Parent PTM] ${note?.trim() || 'Parent requested a call/meeting for academic update'}`;

    const meetingRows = await this.query(
      `INSERT INTO mentorship_meetings
         (student_user_id, proctor_user_id, requested_time, topic, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING meeting_id, requested_time, topic, status`,
      [studentUserId, proctorUserId, requestedTime.toISOString(), topic],
    );

    await this.query(
      `INSERT INTO proctor_interactions
         (student_user_id, proctor_user_id, interaction_type, payload, status)
       VALUES ($1, $2, 'MEETING', $3::jsonb, 'REQUESTED')`,
      [
        studentUserId,
        proctorUserId,
        JSON.stringify({
          meeting_id: meetingRows[0].meeting_id,
          source: 'parent_portal',
          parent_mobile: parentMobile,
          note: topic,
        }),
      ],
    );

    const formatted = requestedTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    this.notify.meetingRequested({
      tenantId: student?.tenant_id ?? DEFAULT_TENANT,
      userId: proctorUserId,
      studentName: student?.name ?? 'Student',
      meetingAt: formatted,
      title: 'Parent-Teacher meeting requested',
      message: `Parent of ${student?.name ?? 'a student'} requested a PTM on ${formatted}. ${topic}`,
      actionLink: '/faculty/mentorship',
    });

    return meetingRows[0];
  }

  async getTracking(parentMobile: string, studentUserId: string) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const gateLogs = await this.query(
      `SELECT gp.pass_id, gp.reason, gp.status, gp.expected_exit_at, gp.expected_return_at,
              gp.exited_at, gp.returned_at, gp.created_at, h.hostel_name
       FROM operations_gate_passes gp
       LEFT JOIN hostel_allocations a ON a.student_user_id = gp.student_user_id AND a.status = 'ACTIVE'
       LEFT JOIN operations_hostel_rooms r ON r.room_id = a.room_id
       LEFT JOIN operations_hostels h ON h.hostel_id = r.hostel_id
       WHERE gp.student_user_id = $1
       ORDER BY gp.created_at DESC
       LIMIT 50`,
      [studentUserId],
    );

    let transport: Awaited<ReturnType<TransportService['getMyAllocation']>> = null;
    let live: Awaited<ReturnType<TransportService['getLiveLocationForStudent']>> | null = null;

    const [user] = await this.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM users WHERE user_id = $1`,
      [studentUserId],
    );
    const tenantId = user?.tenant_id ?? DEFAULT_TENANT;

    try {
      transport = await this.transport.getMyAllocation(tenantId, studentUserId);
      if (transport?.pass_status === 'ACTIVE') {
        live = await this.transport.getLiveLocationForStudent(tenantId, studentUserId);
      }
    } catch {
      transport = null;
      live = null;
    }

    return { gate_logs: gateLogs, transport_allocation: transport, live_bus: live };
  }

  async createPaymentOrder(parentMobile: string, studentUserId: string, demandId: string) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const rows = await this.query<{
      demand_id: string;
      fee_head: string;
      total_amount: string;
      paid_amount: string;
      status: string;
    }>(
      `SELECT demand_id, fee_head, total_amount, paid_amount, status
       FROM finance_fee_demands WHERE demand_id = $1 AND student_user_id = $2`,
      [demandId, studentUserId],
    );
    const demand = rows[0];
    if (!demand) throw new NotFoundException('Fee demand not found');
    if (demand.status === 'PAID') throw new BadRequestException('Already paid');

    const outstanding = Math.max(0, Number(demand.total_amount) - Number(demand.paid_amount ?? 0));
    if (outstanding <= 0) throw new BadRequestException('Nothing due');

    const orderId = `order_parent_${demandId.replace(/-/g, '').slice(0, 10)}_${Date.now()}`;
    return {
      order_id: orderId,
      demand_id: demandId,
      amount_inr: outstanding,
      amount_paise: Math.round(outstanding * 100),
      currency: 'INR',
      fee_head: demand.fee_head,
      razorpay_key: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_FALCON_CAMPUS',
      mock: true,
    };
  }

  async confirmPayment(
    parentMobile: string,
    studentUserId: string,
    demandId: string,
    gatewayPaymentId?: string,
  ) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const rows = await this.query<{
      demand_id: string;
      total_amount: string;
      paid_amount: string;
      status: string;
    }>(
      `SELECT * FROM finance_fee_demands WHERE demand_id = $1 AND student_user_id = $2`,
      [demandId, studentUserId],
    );
    const demand = rows[0];
    if (!demand) throw new BadRequestException('Fee demand not found');
    if (demand.status === 'PAID') return { already_paid: true, demand_id: demandId };

    const outstanding = Math.max(0, Number(demand.total_amount) - Number(demand.paid_amount ?? 0));
    const paymentId = gatewayPaymentId ?? `pay_parent_${Date.now()}`;

    await this.query(
      `INSERT INTO finance_transactions (
         student_user_id, demand_id, gateway, gateway_payment_id, gateway_reference,
         amount, status, payment_mode, receipt_url
       ) VALUES ($1, $2, 'RAZORPAY', $3, $3, $4, 'SUCCESS', 'UPI', $5)`,
      [studentUserId, demandId, paymentId, outstanding, `/receipts/${paymentId}.pdf`],
    );

    await this.query(
      `UPDATE finance_fee_demands
       SET paid_amount = total_amount, status = 'PAID', updated_at = NOW()
       WHERE demand_id = $1`,
      [demandId],
    );

    return { paid: true, demand_id: demandId, payment_id: paymentId, amount: outstanding };
  }

  async generateFeeCertificate(parentMobile: string, studentUserId: string, financialYear?: string) {
    await this.assertChildLinked(parentMobile, studentUserId);

    const fy = financialYear ?? this.currentFinancialYear();
    const [startYear] = fy.split('-').map(Number);
    const fyStart = `${startYear}-04-01`;
    const fyEnd = `${startYear + 1}-03-31`;

    const [student] = await this.query<{
      name: string;
      enrollment_number: string | null;
      admission_number: string | null;
    }>(
      `SELECT u.name,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number,
              sp.admission_number
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [studentUserId],
    );

    const payments = await this.query<{ fee_head: string; amount: string; paid_at: string }>(
      `SELECT d.fee_head, t.amount::text, t.created_at::text AS paid_at
       FROM finance_transactions t
       JOIN finance_fee_demands d ON d.demand_id = t.demand_id
       WHERE t.student_user_id = $1 AND t.status = 'SUCCESS'
         AND t.created_at::date BETWEEN $2::date AND $3::date
       ORDER BY t.created_at`,
      [studentUserId, fyStart, fyEnd],
    );

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.03, 0.14, 0.29);

    page.drawText('Suresh Gyan Vihar University', { x: 50, y: 780, size: 18, font: bold, color: navy });
    page.drawText('Annual Fee Payment Certificate (Section 80C / Tuition)', {
      x: 50,
      y: 755,
      size: 12,
      font: bold,
    });
    page.drawText(`Financial Year: ${fy}`, { x: 50, y: 730, size: 10, font });
    page.drawText(`Student: ${student?.name ?? '—'}`, { x: 50, y: 710, size: 10, font });
    page.drawText(
      `Enrollment: ${student?.enrollment_number ?? student?.admission_number ?? '—'}`,
      { x: 50, y: 690, size: 10, font },
    );
    page.drawText(`University PAN: ${UNIVERSITY_PAN}`, { x: 50, y: 670, size: 10, font });
    page.drawText('This certifies tuition & academic fees received as below:', { x: 50, y: 645, size: 10, font });

    let y = 620;
    for (const p of payments.slice(0, 12)) {
      page.drawText(
        `• ${p.fee_head}: ₹${Number(p.amount).toLocaleString('en-IN')} (${new Date(p.paid_at).toLocaleDateString('en-IN')})`,
        { x: 55, y, size: 9, font },
      );
      y -= 16;
    }

    page.drawText(`Total Tuition Fees Paid: ₹${totalPaid.toLocaleString('en-IN')}`, {
      x: 50,
      y: y - 10,
      size: 12,
      font: bold,
      color: navy,
    });
    page.drawText('Authorized for income-tax documentation purposes.', { x: 50, y: 80, size: 8, font });
    page.drawText('[University Seal]', { x: 400, y: 100, size: 10, font: bold, color: navy });

    const bytes = await pdf.save();
    const relDir = path.join('parent-certificates', fy);
    const absDir = path.join(process.cwd(), 'uploads', relDir);
    fs.mkdirSync(absDir, { recursive: true });
    const fileName = `${studentUserId.slice(0, 8)}-${fy}.pdf`;
    const absPath = path.join(absDir, fileName);
    fs.writeFileSync(absPath, bytes);

    return {
      financial_year: fy,
      total_paid: totalPaid,
      download_url: `/uploads/${relDir}/${fileName}`.replace(/\\/g, '/'),
      payments_count: payments.length,
    };
  }

  getAttendance(studentUserId: string) {
    return this.query(
      `SELECT c.course_code, c.course_name, e.attendance_percent
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 ORDER BY c.course_code`,
      [studentUserId],
    );
  }

  getMarks(studentUserId: string) {
    return this.query(
      `SELECT c.course_code, c.course_name, e.semester, e.grade, e.grade_points
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 ORDER BY e.semester DESC, c.course_code`,
      [studentUserId],
    );
  }

  getFeeDues(studentUserId: string) {
    return this.query(
      `SELECT demand_id, fee_head, academic_year, semester, total_amount, paid_amount, due_date, status
       FROM finance_fee_demands WHERE student_user_id = $1 ORDER BY due_date ASC`,
      [studentUserId],
    );
  }

  getDiscipline(studentUserId: string) {
    return this.query(
      `SELECT incident_date, category, description, action_taken
       FROM student_disciplinary_records WHERE student_user_id = $1 ORDER BY incident_date DESC`,
      [studentUserId],
    ).then(async (legacy) => {
      const demerits = await this.query<{
        incident_date: string;
        category: string;
        description: string;
        action_taken: string;
      }>(
        `SELECT di.updated_at::date AS incident_date,
                di.category,
                di.description,
                COALESCE(di.dc_committee_remarks, di.points::text || ' demerit point(s) approved') AS action_taken
         FROM demerit_incidents di
         WHERE di.student_user_id = $1 AND di.status = 'APPROVED_BY_DC'
         ORDER BY di.updated_at DESC`,
        [studentUserId],
      ).catch(() => []);
      return [...demerits, ...legacy];
    });
  }

  getDemeritSummary(studentUserId: string) {
    return this.query(
      `SELECT cumulative_demerit_points, is_subject_back_triggered, subject_back_triggered_at
       FROM student_academic_summaries WHERE student_user_id = $1`,
      [studentUserId],
    ).then((rows) => rows[0] ?? { cumulative_demerit_points: 0, is_subject_back_triggered: false });
  }

  getUfmCases(studentUserId: string) {
    return this.query(
      `SELECT case_id, description, penalty_applied, status, logged_at
       FROM ufm_cases WHERE student_user_id = $1 ORDER BY logged_at DESC`,
      [studentUserId],
    );
  }

  private async resolveStudentId(parentMobile: string, studentUserId?: string) {
    if (studentUserId) {
      await this.assertChildLinked(parentMobile, studentUserId);
      return studentUserId;
    }
    const rows = await this.query<{ student_user_id: string }>(
      `SELECT student_user_id FROM parent_student_links
       WHERE parent_mobile = $1 ORDER BY created_at DESC LIMIT 1`,
      [parentMobile],
    );
    const id = rows[0]?.student_user_id;
    if (!id) throw new NotFoundException('No linked student found');
    return id;
  }

  private currentFinancialYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (month >= 4) return `${year}-${year + 1}`;
    return `${year - 1}-${year}`;
  }

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }
}
