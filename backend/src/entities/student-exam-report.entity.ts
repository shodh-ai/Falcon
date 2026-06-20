import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type StudentExamReportStatus = 'PASS' | 'FAIL' | 'WITHHELD' | 'ABSENT';

@Entity('student_exam_reports')
@Index(['tenant_id', 'student_user_id'])
export class StudentExamReport extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  report_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid' })
  session_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'uuid' })
  course_id: string;

  @Column({ length: 30 })
  exam_type: string;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  marks_obtained: number;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  max_marks: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percent: number | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  grade: string | null;

  @Column({ type: 'numeric', precision: 4, scale: 2, nullable: true })
  grade_points: number | null;

  @Column({ length: 20, default: 'PASS' })
  result_status: StudentExamReportStatus;

  @Column({ type: 'text', nullable: true })
  report_summary: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  declared_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  notified_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
