import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type LeadStage =
  | 'INQUIRY'
  | 'CONTACTED'
  | 'DOCUMENT_VERIFICATION'
  | 'APPLICATION_SUBMITTED'
  | 'OFFERED'
  | 'ENROLLED'
  | 'LOST';

@Entity('admissions_leads')
@Index(['stage'])
@Index(['email'])
@Index(['phone'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  lead_id: string;

  @Column({ length: 200 })
  full_name: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 20, default: 'INQUIRY' })
  stage: LeadStage;

  @Column({ length: 50, nullable: true })
  source: string;

  @Column({ type: 'int', nullable: true })
  preferred_program_id: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
