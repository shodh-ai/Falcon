import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('dept_financial_scores')
@Index(['tenant_id', 'score_date'])
export class DeptFinancialScore extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  score_id: string;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  score_date: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  total_score: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  budget_adherence: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  roi_score: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  receivables_score: number;
}
