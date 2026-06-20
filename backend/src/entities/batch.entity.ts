import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('academic_sis_batches')
@Index(['program_id'])
@Index(['academic_year'])
export class Batch extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  batch_id: number;

  @Column({ length: 80 })
  batch_name: string;

  @Column({ type: 'int' })
  program_id: number;

  @Column({ length: 12 })
  academic_year: string;

  @Column({ type: 'int', nullable: true })
  current_semester: number;

  @Column({ type: 'int', nullable: true })
  section_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
