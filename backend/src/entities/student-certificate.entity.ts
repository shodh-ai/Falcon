import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';

export type CertificateVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

@Entity('student_certificates')
@Index(['tenant_id', 'student_user_id'])
@Index(['verification_status'])
export class StudentCertificate extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  certificate_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_user_id' })
  student: User;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 255 })
  issuer: string;

  @Column({ type: 'date', nullable: true })
  issue_date: string | null;

  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'text', nullable: true })
  file_key: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  original_filename: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mime_type: string | null;

  @Column({ type: 'int', nullable: true })
  file_size: number | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  verification_status: CertificateVerificationStatus;

  @Column({ type: 'int', default: 0 })
  points_awarded: number;

  @Column({ type: 'uuid', nullable: true })
  verified_by_user_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @CreateDateColumn()
  uploaded_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
