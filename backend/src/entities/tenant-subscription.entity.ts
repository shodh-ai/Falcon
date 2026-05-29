import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

/** Feature modules that can be toggled per subscription (Salesforce-style entitlements). */
export const TENANT_FEATURES = [
  'transport',
  'hostel',
  'exams',
  'helpdesk',
  'ai_document_verification',
  'mentorship',
  'iqac',
  'hr',
  'analytics_premium',
] as const;

export type TenantFeature = (typeof TENANT_FEATURES)[number];

@Entity({ schema: 'public', name: 'tenant_subscriptions' })
@Index(['tenant_id', 'feature_key'], { unique: true })
export class TenantSubscription {
  @PrimaryGeneratedColumn('uuid')
  subscription_id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenant_id: string;

  @ManyToOne(() => Tenant, (t) => t.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 64, name: 'feature_key' })
  feature_key: string;

  @Column({ default: true, name: 'is_enabled' })
  is_enabled: boolean;

  @Column({ type: 'date', nullable: true, name: 'expires_at' })
  expires_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
