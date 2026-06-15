import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { User } from './user.entity';

export type MentorshipMeetingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

@Entity('mentorship_meetings')
@Index(['proctor_user_id', 'status'])
@Index(['student_user_id'])
export class MentorshipMeeting extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  meeting_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_user_id' })
  student: User;

  @Column({ type: 'uuid' })
  proctor_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proctor_user_id' })
  proctor: User;

  @Column({ type: 'timestamptz' })
  requested_time: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  topic: string | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: MentorshipMeetingStatus;

  @Column({ type: 'text', nullable: true })
  proctor_remarks: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
