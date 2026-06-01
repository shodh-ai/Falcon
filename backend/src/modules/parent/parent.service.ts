import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

@Injectable()
export class ParentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
      tenantId: row.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
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

  async getChildOverview(parentMobile: string) {
    return {
      parent_mobile: parentMobile,
      children: await this.query(
        `SELECT l.student_user_id, u.name, u.official_email
         FROM parent_student_links l
         JOIN users u ON u.user_id = l.student_user_id
         WHERE l.parent_mobile = $1`,
        [parentMobile],
      ),
    };
  }

  async getAttendanceForParent(parentMobile: string) {
    return this.getForParentMobile(parentMobile, (id) => this.getAttendance(id));
  }

  async getMarksForParent(parentMobile: string) {
    return this.getForParentMobile(parentMobile, (id) => this.getMarks(id));
  }

  async getFeeDuesForParent(parentMobile: string) {
    return this.getForParentMobile(parentMobile, (id) => this.getFeeDues(id));
  }

  async getDisciplineForParent(parentMobile: string) {
    const academics = await this.getForParentMobile(parentMobile, (id) => this.getDiscipline(id));
    const ufm = await this.getForParentMobile(parentMobile, (id) => this.getUfmCases(id));
    return { disciplinary: academics, ufm_cases: ufm };
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
    );
  }

  getUfmCases(studentUserId: string) {
    return this.query(
      `SELECT case_id, description, penalty_applied, status, logged_at
       FROM ufm_cases WHERE student_user_id = $1 ORDER BY logged_at DESC`,
      [studentUserId],
    );
  }

  private query(sql: string, params: unknown[]) {
    return this.dataSource.query(sql, params);
  }

  private async getForParentMobile<T>(parentMobile: string, loader: (studentUserId: string) => Promise<T>) {
    const rows = await this.query(
      `SELECT student_user_id FROM parent_student_links WHERE parent_mobile = $1 ORDER BY created_at DESC LIMIT 1`,
      [parentMobile],
    );
    const studentUserId = rows[0]?.student_user_id;
    if (!studentUserId) return [];
    return loader(studentUserId);
  }
}
