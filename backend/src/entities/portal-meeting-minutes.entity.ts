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
import { PortalMeeting } from './portal-meeting.entity';

@Entity('portal_meeting_minutes')
export class PortalMeetingMinutes {
  @PrimaryGeneratedColumn('uuid')
  minutes_id: string;

  @Column({ type: 'uuid', unique: true })
  meeting_id: string;

  @ManyToOne(() => PortalMeeting, (m) => m.minutes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting: PortalMeeting;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'text', nullable: true })
  decisions: string | null;

  @Column({ type: 'text', nullable: true })
  action_items: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updater: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
