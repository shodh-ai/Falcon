import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

/**
 * Late-fee escalation table the cron job evaluates against each `FeeDemand`
 * whose `due_date` has lapsed. `slabs` is JSON so the registrar can edit
 * tiers (e.g. "0-7 days: ₹100/day", "8-30 days: ₹200/day") without code
 * changes.
 */
@Entity('finance_late_fine_policies')
export class LateFinePolicy extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  policy_id: number;

  @Column({ length: 120 })
  policy_name: string;

  @Column({ length: 40, nullable: true })
  applies_to_fee_head: string;

  @Column({ type: 'jsonb' })
  slabs: Record<string, unknown>;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'date', nullable: true })
  effective_from: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
