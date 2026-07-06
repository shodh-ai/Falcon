import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('university_policies')
export class UniversityPolicy {
  @PrimaryGeneratedColumn('uuid')
  policy_id: string;

  @Column('uuid')
  tenant_id: string;

  @Column('varchar')
  title: string;

  @Column('text')
  description: string;

  @Column('varchar', { nullable: true })
  file_url: string | null;

  @Column('varchar')
  authority_role: string; // e.g., 'Warden', 'Dean', 'Vice Chancellor'

  @Column('boolean', { default: false })
  is_mandatory: boolean;

  @Column('boolean', { default: false })
  is_voting_enabled: boolean;

  @Column('varchar', { default: 'ACTIVE' }) // ACTIVE, INACTIVE
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
