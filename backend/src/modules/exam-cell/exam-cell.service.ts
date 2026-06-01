import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ExamCellService {
  constructor(private readonly dataSource: DataSource) {}

  listSeatingPlans() {
    return this.dataSource.query(
      `SELECT s.*, e.exam_type, e.exam_date, e.venue
       FROM exam_seating_plans s
       LEFT JOIN exam_schedules e ON e.exam_schedule_id = s.exam_schedule_id
       ORDER BY s.created_at DESC`,
    );
  }

  listGradeCards() {
    return this.dataSource.query(
      `SELECT g.*, u.name AS student_name, u.official_email AS student_email
       FROM grade_cards g
       JOIN users u ON u.user_id = g.student_user_id
       ORDER BY g.created_at DESC`,
    );
  }

  listUfmCases() {
    return this.dataSource.query(
      `SELECT c.*, u.name AS student_name, u.official_email AS student_email, e.exam_type, e.exam_date
       FROM ufm_cases c
       LEFT JOIN users u ON u.user_id = c.student_user_id
       LEFT JOIN exam_schedules e ON e.exam_schedule_id = c.exam_id
       ORDER BY c.logged_at DESC`,
    );
  }

  createUfmCase(dto: { student_user_id?: string; exam_id?: string; description?: string; penalty_applied?: string }) {
    return this.dataSource.query(
      `INSERT INTO ufm_cases (tenant_id, student_user_id, exam_id, description, penalty_applied)
       VALUES ('a0000000-0000-4000-8000-000000000001', $1, $2, $3, $4)
       RETURNING *`,
      [dto.student_user_id ?? null, dto.exam_id ?? null, dto.description ?? 'UFM case logged', dto.penalty_applied ?? null],
    );
  }
}
