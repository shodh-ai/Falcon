import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

@Entity('academic_attendance_records')
@Index(['student_user_id', 'session_date'])
@Index(['subject_id', 'session_date'])
@Index(['batch_id', 'session_date'])
export class AttendanceRecord extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  attendance_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'int' })
  subject_id: number;

  @Column({ type: 'int', nullable: true })
  batch_id: number;

  @Column({ type: 'date' })
  session_date: string;

  @Column({ length: 20, nullable: true })
  session_slot: string;

  @Column({ length: 10, default: 'PRESENT' })
  status: AttendanceStatus;

  @Column({ type: 'uuid', nullable: true })
  marked_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;
}
