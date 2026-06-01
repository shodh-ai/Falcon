import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AlumniService {
  constructor(private readonly dataSource: DataSource) {}

  profiles() {
    return this.dataSource.query('SELECT * FROM alumni_profiles ORDER BY created_at DESC');
  }

  donations() {
    return this.dataSource.query(
      `SELECT d.*, a.name AS alumni_name
       FROM alumni_donations d
       LEFT JOIN alumni_profiles a ON a.alumni_id = d.alumni_id
       ORDER BY d.created_at DESC`,
    );
  }

  events() {
    return this.dataSource.query('SELECT * FROM alumni_events ORDER BY event_date DESC');
  }

  exitClearance() {
    return this.dataSource.query(
      `SELECT t.*, u.name AS student_name, u.official_email AS student_email
       FROM student_exit_clearance_tasks t
       JOIN users u ON u.user_id = t.student_user_id
       ORDER BY t.created_at DESC`,
    );
  }
}
