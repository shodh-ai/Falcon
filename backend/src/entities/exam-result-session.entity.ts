import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type ExamResultEntryStatus = 'CLOSED' | 'OPEN' | 'LOCKED';

@Entity('exam_result_sessions')
@Index(['tenant_id', 'entry_status'])
export class ExamResultSession extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  session_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid' })
  course_id: string;

  @Column({ length: 30 })
  exam_type: string;

  @Column({ type: 'int', default: 4 })
  semester: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 100 })
  max_marks: number;

  @Column({ length: 20, default: 'CLOSED' })
  entry_status: ExamResultEntryStatus;

  @Column({ type: 'timestamptz', nullable: true })
  entry_open_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  entry_close_at: Date | null;

  @Column({ default: false })
  marks_locked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  marks_locked_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  marks_locked_by: string | null;

  @Column({ type: 'text', nullable: true })
  reopen_reason: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  pass_marks: number | null;

  @Column({ type: 'int', nullable: true })
  grading_policy_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  processed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  declared_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  declared_by: string | null;

  @Column({ type: 'text', nullable: true })
  declaration_note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
