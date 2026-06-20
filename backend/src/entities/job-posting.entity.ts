import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type JobPostingStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';

@Entity('placement_job_postings')
@Index(['status'])
export class JobPosting extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  job_id: string;

  @Column({ length: 200 })
  company_name: string;

  @Column({ length: 200 })
  role_title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  ctc_lpa: number;

  @Column({ length: 200, nullable: true })
  location: string;

  @Column({ type: 'jsonb', nullable: true })
  eligibility: Record<string, unknown> | null;

  @Column({ default: true })
  one_student_one_job: boolean;

  @Column({ type: 'date', nullable: true })
  apply_deadline: string;

  @Column({ length: 20, default: 'DRAFT' })
  status: JobPostingStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
