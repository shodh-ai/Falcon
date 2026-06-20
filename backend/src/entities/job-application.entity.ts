import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { JobPosting } from './job-posting.entity';

export type JobApplicationStatus =
  | 'APPLIED'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

@Entity('placement_job_applications')
@Index(['job_id'])
@Index(['student_user_id'])
@Index(['status'])
export class JobApplication extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  application_id: string;

  @ManyToOne(() => JobPosting)
  @JoinColumn({ name: 'job_id' })
  job: JobPosting;

  @Column()
  job_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ length: 20, default: 'APPLIED' })
  status: JobApplicationStatus;

  @Column({ type: 'jsonb', nullable: true })
  responses: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
