import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('bank_balance_snapshots')
@Index(['tenant_id', 'balance_date'])
@Index(['tenant_id', 'bank_account_key', 'balance_date'], { unique: true })
export class BankBalanceSnapshot extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  snapshot_id: string;

  @Column({ length: 80 })
  bank_account_key: string;

  @Column({ type: 'date' })
  balance_date: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  closing_balance: number;

  @Column({ length: 30, default: 'BANK_FEED' })
  source: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
