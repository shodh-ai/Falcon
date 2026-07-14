import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { User } from './user.entity';
import { School } from './school.entity';

@Entity('departments')
export class Department extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  dept_id: number;

  @Column({ unique: true, length: 100 })
  dept_name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  hod_user_id: string | null;

  @Column({ type: 'int', nullable: true })
  school_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hod_user_id' })
  hod: User | null;

  @ManyToOne(() => School, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
