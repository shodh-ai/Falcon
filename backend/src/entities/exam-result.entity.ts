import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('academic_exam_results')
@Index(['student_user_id', 'subject_id'])
@Index(['exam_session'])
export class ExamResult extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  result_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'int' })
  subject_id: number;

  @Column({ length: 30 })
  exam_session: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  marks_obtained: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  max_marks: number;

  @Column({ length: 4, nullable: true })
  grade: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, nullable: true })
  grade_points: number;

  @Column({ length: 12, default: 'PROVISIONAL' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
