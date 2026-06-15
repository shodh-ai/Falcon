import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type HostelRequestType = 'GATE_PASS' | 'ROOM_CHANGE' | 'MESS_CHANGE' | 'MAINTENANCE';
export type HostelRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity('hostel_requests')
@Index(['student_user_id'])
@Index(['request_type'])
@Index(['status'])
export class HostelRequest extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  request_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ length: 20 })
  request_type: HostelRequestType;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ length: 20, default: 'PENDING' })
  status: HostelRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  warden_user_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejected_at: Date | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  qr_token: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
