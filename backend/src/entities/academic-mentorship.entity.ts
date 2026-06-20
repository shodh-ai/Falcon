import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { User } from './user.entity';

@Entity('academic_mentorships')
@Index(['student_user_id'], { unique: true })
@Index(['proctor_user_id'])
export class AcademicMentorship extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  mentorship_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'student_user_id' })
  student: User;

  @Column({ type: 'uuid' })
  proctor_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'proctor_user_id' })
  proctor: User;

  @Column({ type: 'uuid', nullable: true })
  assigned_by_user_id: string;

  @Column({ type: 'date', nullable: true })
  active_from: string;

  @Column({ type: 'date', nullable: true })
  active_till: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
