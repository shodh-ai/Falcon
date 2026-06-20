import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('owner_daily_briefs')
@Index(['tenant_id', 'brief_date'], { unique: true })
export class OwnerDailyBrief extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  brief_id: string;

  @Column({ type: 'date' })
  brief_date: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  bullets: string[];

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  sources: Record<string, unknown>;

  @CreateDateColumn()
  generated_at: Date;
}
