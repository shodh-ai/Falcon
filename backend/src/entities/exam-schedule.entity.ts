import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type ExamType = 'MID_TERM' | 'END_TERM' | 'PRACTICAL';
export type ExamScheduleStatus = 'SCHEDULED' | 'RELEASED' | 'CANCELLED';

@Entity('exam_schedules')
@Index(['exam_date'])
@Index(['subject_id'])
@Index('idx_hall_schedule_session', ['tenant_id', 'session_id'])
export class ExamSchedule extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  exam_schedule_id: string;

  // Legacy records may be unlinked. Official issuance must require both IDs.
  @Column({ type: 'uuid', nullable: true })
  tenant_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  session_id: string | null;

  // Existing exam_schedules.status column. RELEASED is set only by the
  // authorized session timetable release workflow.
  @Column({ type: 'varchar', length: 50, default: 'SCHEDULED' })
  status: ExamScheduleStatus;

  @Column({ length: 20 })
  exam_type: ExamType;

  @Column({ type: 'int' })
  subject_id: number;

  @Column({ type: 'date' })
  exam_date: string;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ length: 120 })
  venue: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  seat_no: string | null;

  @CreateDateColumn()
  created_at: Date;
}
