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
export class TaskAssignment extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  assignment_id: string;

  @ManyToOne(() => TaskMaster)
  @JoinColumn({ name: 'task_id' })
  task: TaskMaster;

  @Column()
  task_id: number;

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
  completed_at: Date;
}
