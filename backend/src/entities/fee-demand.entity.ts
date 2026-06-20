import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type FeeDemandStatus =
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'WAIVED';

@Entity('finance_fee_demands')
@Index(['student_user_id'])
@Index(['status'])
@Index(['due_date'])
export class FeeDemand extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  demand_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ length: 40 })
  fee_head: string;

  @Column({ length: 12 })
  academic_year: string;

  @Column({ type: 'int', nullable: true })
  semester: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  paid_amount: number;

  @Column({ type: 'date' })
  due_date: string;

  @Column({ length: 20, default: 'PENDING' })
  status: FeeDemandStatus;

  @Column({ type: 'jsonb', nullable: true })
  fee_breakup: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
