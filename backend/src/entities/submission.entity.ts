import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { TaskAssignment } from './task-assignment.entity';
import { AiSubmissionStatus } from '../common/enums/ai-submission-status.enum';

@Entity('submissions')
@Index(['assignment_id'])
@Index(['ai_status'])
export class Submission extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  submission_id: string;

  @ManyToOne(() => TaskAssignment)
  @JoinColumn({ name: 'assignment_id' })
  assignment: TaskAssignment;

  @Column({ name: 'assignment_id' })
  assignment_id: string;

  @Column({ length: 500, nullable: true })
  file_path: string;

  @Column({ length: 255, nullable: true })
  file_name: string;

  @Column({ type: 'bigint', nullable: true })
  file_size: number;

  @Column({ length: 50, nullable: true })
  file_type: string;

  @Column({ type: 'text', nullable: true })
  text_input: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  ai_status: AiSubmissionStatus | null;

  @Column({ type: 'jsonb', nullable: true })
  ai_extracted_data: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  ai_remarks: string | null;

  @CreateDateColumn({ name: 'uploaded_at' })
  uploaded_at: Date;
}
