import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HrShift } from './hr-shift.entity';
import { User } from './user.entity';

@Entity('hr_employee_profiles')
export class HrEmployeeProfile {
  @PrimaryGeneratedColumn('uuid')
  profile_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  employee_id: string;

  @Column({ type: 'varchar', length: 140, nullable: true })
  designation: string | null;

  @Column({ type: 'date' })
  joining_date: string;

  @Column({ type: 'uuid', nullable: true })
  shift_id: string | null;

  @ManyToOne(() => HrShift, { nullable: true })
  @JoinColumn({ name: 'shift_id' })
  shift: HrShift | null;

  @Column({ type: 'int', default: 0 })
  week_off_day: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
