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
import { User } from './user.entity';
import { PortalMeeting } from './portal-meeting.entity';

export type PortalMeetingParticipantRole = 'ORGANIZER' | 'INVITEE' | 'ATTENDEE';
export type PortalMeetingRsvpStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

@Entity('portal_meeting_participants')
@Index(['user_id', 'rsvp_status'])
@Index(['meeting_id'])
export class PortalMeetingParticipant {
  @PrimaryGeneratedColumn('uuid')
  participant_id: string;

  @Column({ type: 'uuid' })
  meeting_id: string;

  @ManyToOne(() => PortalMeeting, (m) => m.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting: PortalMeeting;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: 'INVITEE' })
  participant_role: PortalMeetingParticipantRole;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  rsvp_status: PortalMeetingRsvpStatus;

  @Column({ type: 'text', nullable: true })
  response_note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
