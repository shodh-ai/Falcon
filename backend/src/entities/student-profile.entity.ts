import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('student_profiles')
@Index(['user_id'], { unique: true })
export class StudentProfile extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  student_profile_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ length: 50, nullable: true })
  enrollment_no: string;

  /** Permanent registration number — assigned once at admission. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  prn_number: string | null;

  @Column({ length: 50, nullable: true })
  batch: string;

  /** Active academic semester (1–8). Drives allocation-based enrollment sync. */
  @Column({ type: 'int', nullable: true })
  current_semester: number | null;

  /** Section within semester (e.g. A, B). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  section_code: string | null;

  @Column({ type: 'jsonb', nullable: true })
  parent_info: Record<string, unknown> | null;

  @Column({ length: 10, nullable: true })
  blood_group: string;

  @Column({ length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  profile_photo_url: string | null;

  @Column({ type: 'jsonb', nullable: true })
  bank_details: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
