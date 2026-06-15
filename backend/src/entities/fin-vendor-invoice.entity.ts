import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('fin_vendor_invoices')
@Index(['tenant_id', 'duplicate_hash'])
export class FinVendorInvoice extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  invoice_id: string;

  @Column({ type: 'uuid' })
  vendor_id: string;

  @Column({ length: 120 })
  invoice_number: string;

  @Column({ type: 'date' })
  invoice_date: string;

  @Column({ type: 'uuid', nullable: true })
  expense_head_id: string | null;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  taxable_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  gst_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  tds_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  net_payable: number;

  @Column({ length: 30, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  duplicate_hash: string | null;

  @Column({ type: 'date', nullable: true })
  payment_due_date: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
