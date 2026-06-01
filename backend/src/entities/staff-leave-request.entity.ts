import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { User } from './user.entity';

export type StaffLeaveStatus = 'PENDING' | 'HOD_APPROVED' | 'HR_APPROVED' | 'REJECTED';

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

  @Column({ type: 'varchar', length: 50 })
  leave_type: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: StaffLeaveStatus;

  @CreateDateColumn()
  applied_at: Date;
}
