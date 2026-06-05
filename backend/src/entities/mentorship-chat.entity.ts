import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MentorshipChatSender = 'STUDENT' | 'FACULTY';

@Entity('mentorship_chats')
@Index(['student_user_id', 'proctor_user_id', 'sent_at'])
export class MentorshipChat {
  @PrimaryGeneratedColumn('uuid')
  message_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'uuid' })
  proctor_user_id: string;

  @Column({ length: 20 })
  sender_type: MentorshipChatSender;

  @Column({ type: 'text' })
  message_text: string;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  sent_at: Date;
}
