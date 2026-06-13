import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type LeaveRequestStatus =
  | 'DRAFT'
  | 'PENDING_HOD'
  | 'PENDING_DEAN'
  | 'PENDING_HR'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type LeaveType = 'CASUAL' | 'SICK' | 'EARNED' | 'MATERNITY' | 'PATERNITY' | 'LWP' | 'OTHER';

@Entity('hr_leave_requests')
@Index(['requester_user_id'])
@Index(['status'])
export class LeaveRequest extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  leave_request_id: string;

  @Column({ type: 'uuid' })
  requester_user_id: string;

  @Column({ length: 20 })
  leave_type: LeaveType;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  total_days: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ length: 20, default: 'PENDING_HOD' })
  status: LeaveRequestStatus;

  @Column({ type: 'jsonb', nullable: true })
  approval_trail: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
