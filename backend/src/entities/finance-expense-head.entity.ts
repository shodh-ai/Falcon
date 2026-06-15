import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('finance_expense_heads')
export class FinanceExpenseHead extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  expense_head_id: string;

  @Column({ length: 40 })
  head_code: string;

  @Column({ length: 180 })
  head_name: string;

  @Column({ type: 'uuid', nullable: true })
  ledger_account_id: string | null;

  @Column({ default: true })
  is_active: boolean;
}
