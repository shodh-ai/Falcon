import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('alumni_donations')
export class AlumniDonation extends BaseSoftDeleteEntity {
  @PrimaryColumn('uuid')
  donation_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'uuid', nullable: true })
  alumni_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  alumni_user_id: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  purpose: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transaction_id: string | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  payment_status: string;

  @Column({ type: 'varchar', length: 40, default: 'RAZORPAY' })
  gateway: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  gateway_reference: string | null;

  @Column({ type: 'varchar', length: 80, default: 'ENDOWMENT' })
  ledger_account: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  tax_receipt_number: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  donated_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
