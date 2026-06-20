import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('cash_flow_forecasts')
@Index(['tenant_id', 'horizon_days', 'forecast_date'])
export class CashFlowForecast extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  forecast_id: string;

  @Column({ type: 'int' })
  horizon_days: number;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  forecast_date: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  projected_balance: number;

  @Column({ type: 'jsonb', default: {} })
  assumptions: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
