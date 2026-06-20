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
import { Lead } from './lead.entity';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

@Entity('admissions_applications')
@Index(['status'])
@Index(['lead_id'])
export class Application extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  application_id: string;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column()
  lead_id: string;

  @Column({ type: 'int' })
  program_id: number;

  @Column({ length: 20, default: 'DRAFT' })
  status: ApplicationStatus;

  @Column({ type: 'jsonb', nullable: true })
  form_data: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  submitted_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
