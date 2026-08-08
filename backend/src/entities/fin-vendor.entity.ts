import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('fin_vendors')
export class FinVendor extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  vendor_id: string;

  @Column({ length: 255 })
  business_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contact_email: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  gstin: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pan_number: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  default_tds_rate: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bank_account_no: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ifsc_code: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'int', default: 0 })
  delayed_payment_count: number;

  @Column({ type: 'int', default: 0 })
  overbilling_flags: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  risk_score: number;

  @Column({ type: 'varchar', length: 40, default: 'UNVERIFIED' })
  gst_verify_status: string;

  @Column({ type: 'timestamptz', nullable: true })
  gst_verified_at: Date | null;

  @Column({ type: 'text', nullable: true })
  gst_legal_name: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pan_from_gst: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  related_party_hash: string | null;

  @CreateDateColumn()
  created_at: Date;
}
