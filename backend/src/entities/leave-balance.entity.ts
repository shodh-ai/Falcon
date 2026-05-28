import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

@Entity('hr_leave_balances')
@Index(['user_id', 'leave_type', 'year'], { unique: true })
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  balance_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ length: 20 })
  leave_type: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  entitled: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  used: number;

  @UpdateDateColumn()
  updated_at: Date;
}
