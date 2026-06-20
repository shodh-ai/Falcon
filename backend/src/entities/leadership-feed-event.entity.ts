import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

export type FeedEventType = 'INCOME' | 'EXPENSE' | 'ALERT';

@Entity('leadership_feed_events')
@Index(['tenant_id', 'created_at'])
export class LeadershipFeedEvent extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  event_id: string;

  @Column({ length: 40 })
  event_type: FeedEventType;

  @Column({ type: 'text' })
  label: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
