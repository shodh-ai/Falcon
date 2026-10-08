import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';
import { StaffPayslip } from './staff-payslip.entity';

export type PayslipDownloadRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity('staff_payslip_download_requests')
@Index(['tenant_id', 'status', 'created_at'])
@Index(['staff_user_id', 'tenant_id', 'created_at'])
export class StaffPayslipDownloadRequest extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  request_id: string;

  @Column({ type: 'uuid', nullable: true })
  payslip_id: string | null;

  @ManyToOne(() => StaffPayslip, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payslip_id' })
  payslip: StaffPayslip | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  period_from: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  period_to: string | null;

  @Column({ type: 'uuid' })
  staff_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staff: User;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: PayslipDownloadRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewer_remarks: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
