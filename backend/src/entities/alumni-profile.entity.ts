import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('alumni_profiles')
@Index(['tenant_id', 'student_user_id'], { unique: true })
export class AlumniProfile extends BaseSoftDeleteEntity {
  @PrimaryColumn('uuid')
  alumni_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid', nullable: true })
  student_user_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  enrollment_number: string | null;

  @Column({ type: 'int', nullable: true })
  batch_year: number | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  program_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  current_organization: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  designation: string | null;

  @Column({ type: 'text', nullable: true })
  linkedin_url: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  higher_education_details: Record<string, unknown>;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  verification_status: string;

  @Column({ type: 'boolean', default: false })
  opt_in_mentorship: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  profile_updated_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  career_update_due_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approved_by_user_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
