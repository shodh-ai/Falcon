import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PlacementService {
  constructor(private readonly dataSource: DataSource) {}

  companies() {
    return this.dataSource.query('SELECT * FROM placement_companies ORDER BY created_at DESC');
  }

  jobs() {
    return this.dataSource.query(
      `SELECT j.*, c.company_name
       FROM placement_job_descriptions j
       JOIN placement_companies c ON c.company_id = j.company_id
       ORDER BY j.created_at DESC`,
    );
  }

  resumes() {
    return this.dataSource.query(
      `SELECT r.*, u.name AS student_name, u.official_email AS student_email
       FROM student_resume_profiles r
       JOIN users u ON u.user_id = r.student_user_id
       ORDER BY r.updated_at DESC`,
    );
  }

  mockInterviews() {
    return this.dataSource.query(
      `SELECT m.*, u.name AS student_name, interviewer.name AS interviewer_name
       FROM placement_mock_interviews m
       JOIN users u ON u.user_id = m.student_user_id
       LEFT JOIN users interviewer ON interviewer.user_id = m.interviewer_user_id
       ORDER BY m.scheduled_at DESC`,
    );
  }
}
