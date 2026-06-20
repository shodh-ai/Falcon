import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';

@Entity('staff_payslips')
@Index(['tenant_id', 'staff_user_id', 'year'])
export class StaffPayslip extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  payslip_id: string;

  @Column({ type: 'uuid' })
  staff_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staff: User;

  @Column({ type: 'varchar', length: 20 })
  month: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  gross_pay: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  net_pay: string | null;

  @Column({ type: 'int', nullable: true })
  working_days: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  lwp_days: string | null;

  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'boolean', default: false })
  is_published: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @CreateDateColumn()
  generated_at: Date;
}
