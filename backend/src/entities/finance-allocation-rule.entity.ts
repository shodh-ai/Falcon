import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('finance_allocation_rules')
@Index(['tenant_id', 'fee_head', 'program_code', 'template_id', 'is_active'])
export class FinanceAllocationRule extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  rule_id: string;

  @Column({ length: 60 })
  fee_head: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  program_code: string | null;

  @Column({ type: 'uuid', nullable: true })
  template_id: string | null;

  @Column({ length: 80 })
  ledger_category: string;

  @Column({ type: 'numeric', precision: 8, scale: 4, default: 0 })
  weight: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
