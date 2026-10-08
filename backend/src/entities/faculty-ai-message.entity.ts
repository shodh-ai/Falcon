import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { FacultyAiConversation } from './faculty-ai-conversation.entity';

export type FacultyAiMessageRole = 'user' | 'assistant' | 'system';

@Entity('faculty_ai_messages')
@Index(['tenant_id', 'conversation_id', 'created_at'])
export class FacultyAiMessage extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  message_id: string;

  @Column({ type: 'uuid' })
  conversation_id: string;

  @ManyToOne(() => FacultyAiConversation, (c) => c.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: FacultyAiConversation;

  @Column({ type: 'varchar', length: 20 })
  role: FacultyAiMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  prompt_type: string | null;

  @Column({ type: 'int', default: 0 })
  token_usage: number;

  @Column({ type: 'jsonb', nullable: true })
  attachments: Array<{ name: string; mime: string; size: number }> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
