import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Application } from './application.entity';

export type DocVerificationStatus =
  | 'UPLOADED'
  | 'AI_VERIFIED'
  | 'MANUAL_REVIEW_NEEDED'
  | 'APPROVED'
  | 'REJECTED';

export type DocumentKind =
  | 'AADHAR'
  | 'TENTH_MARKSHEET'
  | 'TWELFTH_MARKSHEET'
  | 'PHOTO'
  | 'SIGNATURE'
  | 'CATEGORY_CERTIFICATE'
  | 'OTHER';

@Entity('admissions_document_verifications')
@Index(['application_id'])
@Index(['status'])
export class DocumentVerification {
  @PrimaryGeneratedColumn('uuid')
  doc_verification_id: string;

  @ManyToOne(() => Application)
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Column()
  application_id: string;

  @Column({ length: 40 })
  document_kind: DocumentKind;

  @Column({ length: 500, nullable: true })
  file_path: string;

  @Column({ length: 30, default: 'UPLOADED' })
  status: DocVerificationStatus;

  @Column({ type: 'jsonb', nullable: true })
  ai_extracted_fields: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  reviewer_notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}
