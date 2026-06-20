import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type GatePassStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXITED'
  | 'RETURNED'
  | 'EXPIRED';

@Entity('operations_gate_passes')
@Index(['student_user_id'])
@Index(['status'])
@Index(['qr_token'], { unique: true })
export class GatePass extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  pass_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'timestamp' })
  expected_exit_at: Date;

  @Column({ type: 'timestamp' })
  expected_return_at: Date;

  @Column({ length: 20, default: 'PENDING' })
  status: GatePassStatus;

  @Column({ length: 80, nullable: true })
  qr_token: string;

  @Column({ type: 'uuid', nullable: true })
  approved_by_user_id: string;

  @Column({ type: 'timestamp', nullable: true })
  exited_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  returned_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
