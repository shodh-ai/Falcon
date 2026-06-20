import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

export type AnomalySeverity = 'GREEN' | 'YELLOW' | 'RED';

@Entity('fin_anomaly_flags')
@Index(['tenant_id', 'severity', 'created_at'])
export class FinAnomalyFlag extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  flag_id: string;

  @Column({ length: 10 })
  severity: AnomalySeverity;

  @Column({ length: 60 })
  rule_code: string;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
