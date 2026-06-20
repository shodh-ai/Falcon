import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type ExamType = 'MID_TERM' | 'END_TERM' | 'PRACTICAL';

@Entity('exam_schedules')
@Index(['exam_date'])
@Index(['subject_id'])
export class ExamSchedule extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  exam_schedule_id: string;

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
