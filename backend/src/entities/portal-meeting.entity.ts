import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { PortalMeetingParticipant } from './portal-meeting-participant.entity';
import { PortalMeetingMinutes } from './portal-meeting-minutes.entity';

export type PortalMeetingMode = 'SCHEDULED' | 'REQUESTED';
export type PortalMeetingStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';

@Entity('portal_meetings')
@Index(['tenant_id', 'starts_at'])
@Index(['organizer_user_id', 'status'])
export class PortalMeeting {
  @PrimaryGeneratedColumn('uuid')
  meeting_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid' })
  organizer_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizer_user_id' })
  organizer: User;

  @Column({ type: 'uuid' })
  requester_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_user_id' })
  requester: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 180 })
  venue: string;

  @Column({ type: 'timestamptz' })
  starts_at: Date;

  @Column({ type: 'timestamptz' })
  ends_at: Date;

  @Column({ type: 'text', nullable: true })
  agenda: string | null;

  @Column({ type: 'varchar', length: 20, default: 'SCHEDULED' })
  meeting_mode: PortalMeetingMode;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: PortalMeetingStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  scope_note: string | null;

  @OneToMany(() => PortalMeetingParticipant, (p) => p.meeting)
  participants: PortalMeetingParticipant[];

  @OneToMany(() => PortalMeetingMinutes, (m) => m.meeting)
  minutes: PortalMeetingMinutes[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
