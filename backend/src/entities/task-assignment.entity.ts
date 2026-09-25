import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { TaskMaster } from './task-master.entity';
import { User } from './user.entity';

@Entity('task_assignments')
@Index(['assigned_to', 'status'])
@Index(['task_id', 'status'])
@Index(['due_date'])
@Index(['tenant_id', 'cycle_year', 'cycle_month'])
export class TaskAssignment extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  assignment_id: string;

  @ManyToOne(() => TaskMaster)
  @JoinColumn({ name: 'task_id' })
  task: TaskMaster;

  @Column()
  task_id: number;

  @Column({ type: 'uuid', nullable: true })
  tenant_id: string | null;

  @Column({ type: 'int', nullable: true })
  dept_id: number | null;

  @Column({ type: 'int', nullable: true })
  cycle_year: number | null;

  @Column({ type: 'smallint', nullable: true })
  cycle_month: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_to' })
  assigned_user: User;

  @Column({ name: 'assigned_to' })
  assigned_to: string;

  @Column({ length: 20, default: 'Pending' })
  status: string;

  @Column({ type: 'date', nullable: true })
  due_date: Date;

  @CreateDateColumn({ name: 'assigned_at' })
  assigned_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'text', nullable: true })
  review_comments: string | null;

  @Column({ type: 'timestamp', nullable: true })
  hod_reviewed_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  hod_reviewed_by: string | null;

  @Column({ type: 'text', nullable: true })
  hod_review_comments: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;
}
