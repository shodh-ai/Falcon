import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('hr_academic_qualifications')
export class HrAcademicQualification {
  @PrimaryGeneratedColumn('uuid')
  qual_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50, nullable: true })
  degree_level: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  degree_name: string | null;

  @Column({ type: 'varchar', length: 255 })
  university: string;

  @Column({ type: 'int' })
  passing_year: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  specialization: string | null;

  @Column({ type: 'text', nullable: true })
  document_proof_url: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
