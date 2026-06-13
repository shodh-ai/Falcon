import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { User } from './user.entity';

export type HrDailyAttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'MISSED_PUNCH';

export type CalculatedAttendanceStatus =
  | 'FULL_DAY'
  | 'HALF_DAY'
  | 'LESS_THAN_HALF_DAY'
  | 'ABSENT'
  | 'WEEK_OFF'
  | 'HOLIDAY'
  | 'RESTRICTED_HOLIDAY'
  | 'LATE_COMING'
  | 'EARLY_GOING'
  | 'PENDING_REQUEST';

@Entity('hr_daily_attendance')
@Index(['user_id', 'date'], { unique: true })
export class HrDailyAttendance extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  record_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'timestamptz', nullable: true })
  first_in_time: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_out_time: Date | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  total_hours: string | null;

  @Column({ type: 'varchar', length: 50, default: 'ABSENT' })
  status: HrDailyAttendanceStatus;

  @Column({ type: 'boolean', default: false })
  is_regularized: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  calculated_status: CalculatedAttendanceStatus | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
