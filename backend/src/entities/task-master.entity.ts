import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { Role } from './role.entity';

@Entity('task_master')
@Index(['month', 'role_id'])
@Index(['tenant_id', 'academic_year', 'month'])
export class TaskMaster extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  task_id: number;

  @Column({ type: 'text' })
  task_name: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id: string | null;

  @Column({ type: 'int', nullable: true })
  dept_id: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  owner_label: string | null;

  @Column({ type: 'uuid', nullable: true })
  default_assignee_id: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  academic_year: string | null;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ nullable: true })
  role_id: number | null;

  @Column({ length: 20 })
  month: string;

  @Column({ default: true })
  is_recurring: boolean;

  @Column({ type: 'text', nullable: true })
  task_description: string | null;

  @Column({ type: 'varchar', length: 32, default: 'MONTH_END' })
  due_date_policy: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evidence_requirements: string[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  source_module: string | null;

  @Column({ type: 'text', nullable: true })
  source_reference: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source_hash: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
