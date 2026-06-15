import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { Role } from './role.entity';

@Entity('task_master')
@Index(['month', 'role_id'])
export class TaskMaster extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  task_id: number;

  @Column({ type: 'text' })
  task_name: string;

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
