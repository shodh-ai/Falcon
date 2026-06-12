import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { FeeDemand } from './fee-demand.entity';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type TransactionStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type PaymentGateway = 'RAZORPAY' | 'PAYU' | 'CASH' | 'CHEQUE' | 'NEFT' | 'OTHER';
export type TransactionDirection = 'IN' | 'OUT';

@Entity('finance_transactions')
@Index(['gateway_reference'])
@Index(['status'])
@Index(['demand_id'])
export class Transaction extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  transaction_id: string;

  @ManyToOne(() => FeeDemand, { nullable: true })
  @JoinColumn({ name: 'demand_id' })
  demand: FeeDemand | null;

  @Column({ type: 'uuid', nullable: true })
  demand_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  student_user_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'RAZORPAY' })
  gateway: PaymentGateway;

  @Column({ type: 'varchar', length: 120, nullable: true })
  gateway_reference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  gateway_order_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  gateway_payment_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_mode: string | null;

  @Column({ type: 'text', nullable: true })
  receipt_url: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ledger_category: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  direction: TransactionDirection | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  txn_kind: string | null;

  @Column({ type: 'varchar', length: 20, default: 'INITIATED' })
  status: TransactionStatus;

  @Column({ type: 'jsonb', nullable: true })
  gateway_payload: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;
}
