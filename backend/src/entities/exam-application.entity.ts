import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type ExamApplicationType = 'RE_EVALUATION' | 'BACKLOG';
export type ExamApplicationFeeStatus = 'PENDING' | 'PAID' | 'WAIVED';
export type ExamApplicationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'ASSIGNED'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED';

@Entity('exam_applications')
@Index(['student_user_id'])
@Index(['status'])
export class ExamApplication extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  exam_application_id: string;

  // Historical migrations create applications before tenant ownership is
  // backfilled by the hardening migration. Keep the bootstrap column nullable;
  // the migration enforces NOT NULL after it resolves ownership.
  @Column({ type: 'uuid', nullable: true })
  tenant_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'int' })
  subject_id: number;

  @Column({ type: 'uuid', nullable: true })
  source_result_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  source_session_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  source_mark_id: string | null;

  @Column({ length: 20 })
  application_type: ExamApplicationType;

  @Column({ length: 20, default: 'PENDING' })
  fee_status: ExamApplicationFeeStatus;

  @Column({ length: 20, default: 'PENDING' })
  status: ExamApplicationStatus;

  @Column({ type: 'uuid', nullable: true })
  finance_demand_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  assigned_faculty_user_id: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  original_marks: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  revised_marks: number | null;

  @Column({ type: 'text', nullable: true })
  report_notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  assigned_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  assigned_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  report_submitted_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  published_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}
