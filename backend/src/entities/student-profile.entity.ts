import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('student_profiles')
@Index(['user_id'], { unique: true })
export class StudentProfile {
  @PrimaryGeneratedColumn('uuid')
  student_profile_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ length: 50, nullable: true })
  enrollment_no: string;

  @Column({ length: 50, nullable: true })
  batch: string;

  @Column({ type: 'jsonb', nullable: true })
  parent_info: Record<string, unknown> | null;

  @Column({ length: 10, nullable: true })
  blood_group: string;

  @Column({ length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
