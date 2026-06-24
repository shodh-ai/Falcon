import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('academic_subjects')
@Index(['subject_code'], { unique: true })
@Index(['program_id'])
export class Subject extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  subject_id: number;

  @Column({ length: 30 })
  subject_code: string;

  @Column({ length: 200 })
  subject_name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subject_shortname: string | null;

  @Column({ type: 'int' })
  program_id: number;

  @Column({ type: 'int', nullable: true })
  semester: number;

  @Column({ type: 'int', nullable: true })
  credits: number;

  @Column({ length: 30, default: 'THEORY' })
  subject_type: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
