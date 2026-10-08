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
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';
import { FacultyAiMessage } from './faculty-ai-message.entity';

@Entity('faculty_ai_conversations')
@Index(['tenant_id', 'faculty_user_id', 'updated_at'])
export class FacultyAiConversation extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  conversation_id: string;

  @Column({ type: 'uuid' })
  faculty_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faculty_user_id' })
  faculty: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  prompt_type: string | null;

  @Column({ type: 'int', default: 0 })
  token_usage: number;

  @OneToMany(() => FacultyAiMessage, (m) => m.conversation)
  messages: FacultyAiMessage[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
