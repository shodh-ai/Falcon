import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { TenantSubscription } from './tenant-subscription.entity';

export type TenantSettings = {
  min_attendance_percent?: number;
  cgpa_formula?: string;
  late_fine_rules?: Record<string, unknown>;
  allowed_email_domains?: string[];
  [key: string]: unknown;
};

@Entity({ schema: 'public', name: 'tenants' })
@Index(['subdomain'], { unique: true })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  tenant_id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 63, unique: true })
  subdomain: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'custom_domain' })
  custom_domain: string | null;

  @Column({ length: 63, name: 'pg_schema' })
  pg_schema: string;

  @Column({ length: 7, name: 'primary_color', default: '#08234a' })
  primary_color: string;

  @Column({ length: 7, name: 'accent_color', default: '#d6b65d' })
  accent_color: string;

  @Column({ type: 'varchar', length: 512, nullable: true, name: 'logo_url' })
  logo_url: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: TenantSettings;

  @Column({ default: true, name: 'is_active' })
  is_active: boolean;

  @OneToMany(() => TenantSubscription, (s) => s.tenant)
  subscriptions: TenantSubscription[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
