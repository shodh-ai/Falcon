import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ParentService {
  constructor(private readonly dataSource: DataSource) {}

  requestOtp(mobile: string) {
    return { mobile, otp_sent: true, channel: 'WHATSAPP_SMS', message: 'OTP queued for registered parent mobile.' };
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
    return this.getForParentMobile(parentMobile, (studentUserId) => this.getAttendance(studentUserId));
  }

  async getMarksForParent(parentMobile: string) {
    return this.getForParentMobile(parentMobile, (studentUserId) => this.getMarks(studentUserId));
  }

  async getFeeDuesForParent(parentMobile: string) {
    return this.getForParentMobile(parentMobile, (studentUserId) => this.getFeeDues(studentUserId));
  }

  async getDisciplineForParent(parentMobile: string) {
    return this.getForParentMobile(parentMobile, (studentUserId) => this.getDiscipline(studentUserId));
  }

  getAttendance(studentUserId: string) {
    return this.query(
      `SELECT c.course_code, c.course_name, e.attendance_percent
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1
       ORDER BY c.course_code`,
      [studentUserId],
    );
  }

  getMarks(studentUserId: string) {
    return this.query(
      `SELECT c.course_code, c.course_name, e.semester, e.grade, e.grade_points
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1
       ORDER BY e.semester DESC, c.course_code`,
      [studentUserId],
    );
  }

  getFeeDues(studentUserId: string) {
    return this.query(
      `SELECT fee_head, academic_year, semester, total_amount, paid_amount, due_date, status
       FROM finance_fee_demands
       WHERE student_user_id = $1
       ORDER BY due_date ASC`,
      [studentUserId],
    );
  }

  getDiscipline(studentUserId: string) {
    return this.query(
      `SELECT incident_date, category, description, action_taken
       FROM student_disciplinary_records
       WHERE student_user_id = $1
       ORDER BY incident_date DESC`,
      [studentUserId],
    );
  }

  private query(sql: string, params: unknown[]) {
    return this.dataSource.query(sql, params);
  }

  private async getForParentMobile<T>(parentMobile: string, loader: (studentUserId: string) => Promise<T>) {
    const rows = await this.query(
      `SELECT student_user_id
       FROM parent_student_links
       WHERE parent_mobile = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [parentMobile],
    );
    const studentUserId = rows[0]?.student_user_id;
    if (!studentUserId) return [];
    return loader(studentUserId);
  }
}
