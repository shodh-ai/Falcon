import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';

export type StaffLeaveStatus = 'PENDING' | 'HOD_APPROVED' | 'HR_APPROVED' | 'REJECTED';

export type StaffRequestType = 'LEAVE' | 'ON_DUTY' | 'COMP_OFF_CREDIT' | 'REGULARIZATION';

@Entity('staff_leave_requests')
@Index(['tenant_id', 'staff_user_id', 'status'])
export class StaffLeaveRequest extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  leave_id: string;

  @Column({ type: 'uuid' })
  staff_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staff: User;

  @Column({ type: 'varchar', length: 50, default: 'LEAVE' })
  request_type: StaffRequestType;

  @Column({ type: 'varchar', length: 50 })
  leave_type: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'date', nullable: true })
  regularization_date: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  missed_punch_type: 'IN' | 'OUT' | 'BOTH' | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: StaffLeaveStatus;

  @Column({ type: 'int', nullable: true })
  entity_id: number | null;

  @Column({ type: 'uuid', nullable: true })
  workflow_id: string | null;

  @Column({ type: 'int', default: 0 })
  current_step_order: number;

  @Column({ type: 'uuid', nullable: true })
  current_approver_user_id: string | null;

  @Column({ type: 'text', nullable: true })
  approver_remarks: string | null;

  @CreateDateColumn()
  applied_at: Date;
}
