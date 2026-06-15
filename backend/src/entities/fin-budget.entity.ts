import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('fin_budgets')
@Index(['tenant_id', 'department_id'])
export class FinBudget extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  budget_id: string;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ length: 9 })
  financial_year: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  allocated_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  utilized_amount: number;

  @CreateDateColumn()
  created_at: Date;
}
