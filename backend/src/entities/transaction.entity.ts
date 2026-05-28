import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { FeeDemand } from './fee-demand.entity';

export type TransactionStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type PaymentGateway = 'RAZORPAY' | 'PAYU' | 'CASH' | 'CHEQUE' | 'NEFT' | 'OTHER';

@Entity('finance_transactions')
@Index(['gateway_reference'])
@Index(['status'])
@Index(['demand_id'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  transaction_id: string;

  @ManyToOne(() => FeeDemand)
  @JoinColumn({ name: 'demand_id' })
  demand: FeeDemand;

  @Column()
  demand_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ length: 20, default: 'RAZORPAY' })
  gateway: PaymentGateway;

  @Column({ length: 120, nullable: true })
  gateway_reference: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 20, default: 'INITIATED' })
  status: TransactionStatus;

  @Column({ type: 'jsonb', nullable: true })
  gateway_payload: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;
}
