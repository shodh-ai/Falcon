import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type AlumniServiceType =
  | 'TRANSCRIPT'
  | 'DEGREE_DISPATCH'
  | 'MIGRATION_CERTIFICATE'
  | 'BONAFIDE'
  | 'OTHER';

export type AlumniRequestStatus =
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'PAYMENT_PENDING'
  | 'DISPATCHED'
  | 'COMPLETED'
  | 'REJECTED';

@Entity('alumni_service_requests')
@Index(['alumni_user_id'])
@Index(['status'])
export class AlumniServiceRequest extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  request_id: string;

  @Column({ type: 'uuid' })
  alumni_user_id: string;

  @Column({ length: 40 })
  service_type: AlumniServiceType;

  @Column({ length: 20, default: 'SUBMITTED' })
  status: AlumniRequestStatus;

  @Column({ type: 'jsonb', nullable: true })
  dispatch_details: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  remarks: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
