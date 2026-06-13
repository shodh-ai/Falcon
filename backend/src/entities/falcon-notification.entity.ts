import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { User } from './user.entity';

export type FalconNotificationCategory =
  | 'ACADEMICS'
  | 'FINANCE'
  | 'HR'
  | 'EXAMS'
  | 'HOSTEL'
  | 'OPERATIONS'
  | 'PLACEMENT'
  | 'HELPDESK';

@Entity('falcon_notifications')
@Index(['user_id', 'created_at'])
export class FalconNotification extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  notification_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  category: FalconNotificationCategory;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  action_link: string | null;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
