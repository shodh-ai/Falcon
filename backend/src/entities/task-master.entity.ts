import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from './role.entity';

@Entity('task_master')
@Index(['month', 'role_id'])
export class TaskMaster {
  @PrimaryGeneratedColumn()
  task_id: number;

  @Column({ type: 'text' })
  task_name: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ nullable: true })
  role_id: number;

  @Column({ length: 20 })
  month: string;

  @Column({ default: true })
  is_recurring: boolean;

  @Column({ type: 'text', nullable: true })
  task_description: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
