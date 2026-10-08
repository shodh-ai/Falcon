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
import { AcademicAssignment } from './academic-assignment.entity';
import { User } from './user.entity';

export type AssignmentNotificationDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED_SCHEDULED'
  | 'SKIPPED_DUPLICATE';

@Entity('assignment_notification_audits')
@Index(['tenant_id', 'delivery_status', 'updated_at'])
export class AssignmentNotificationAudit extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  audit_id: string;

  @Column({ type: 'uuid' })
  assignment_id: string;

  @ManyToOne(() => AcademicAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: AcademicAssignment;

  @Column({ type: 'uuid' })
  faculty_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faculty_user_id' })
  faculty: User;

  @Column({ type: 'int', default: 0 })
  students_targeted: number;

  @Column({ type: 'int', default: 0 })
  students_notified: number;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  delivery_status: AssignmentNotificationDeliveryStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  failed_user_ids: string[];

  @Column({ type: 'text', nullable: true })
  error_summary: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
