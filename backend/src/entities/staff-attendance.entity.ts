import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('hr_staff_attendance')
@Index(['user_id', 'work_date'], { unique: true })
export class StaffAttendance {
  @PrimaryGeneratedColumn('uuid')
  attendance_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'date' })
  work_date: string;

  @Column({ type: 'timestamp', nullable: true })
  check_in_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  check_out_at: Date;

  @Column({ length: 20, default: 'PRESENT' })
  status: string;

  @Column({ length: 30, nullable: true })
  source: string;

  @CreateDateColumn()
  created_at: Date;
}
