import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';

export type StaffGatePassStatus = 'PENDING' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';

@Entity('staff_gate_passes')
@Index(['tenant_id', 'staff_user_id', 'status'])
@Index(['tenant_id', 'reporting_officer_id', 'status'])
export class StaffGatePass extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  pass_id: string;

  @Column({ type: 'uuid' })
  staff_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staff: User;

  @Column({ type: 'uuid', nullable: true })
  reporting_officer_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporting_officer_id' })
  reportingOfficer: User | null;

  @Column({ type: 'timestamp' })
  out_time: Date;

  @Column({ type: 'timestamp' })
  expected_in_time: Date;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: StaffGatePassStatus;
}
