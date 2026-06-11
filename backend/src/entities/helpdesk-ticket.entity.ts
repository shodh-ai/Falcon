import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type HelpdeskTicketCategory =
  | 'FINANCE'
  | 'ACADEMICS'
  | 'IT'
  | 'HOSTEL'
  | 'MENTORSHIP'
  | 'STUDENT_PROFILE';
export type HelpdeskTicketStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

@Entity('helpdesk_tickets')
@Index(['student_user_id'])
@Index(['assigned_to_user_id'])
@Index(['category'])
@Index(['status'])
export class HelpdeskTicket {
  @PrimaryGeneratedColumn('uuid')
  ticket_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ length: 20 })
  category: HelpdeskTicketCategory;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 20, default: 'PENDING' })
  status: HelpdeskTicketStatus;

  @Column({ type: 'uuid', nullable: true })
  assigned_to_user_id: string;

  @Column({ type: 'jsonb', nullable: true })
  conversation: Array<{
    sender_user_id: string;
    sender_role: string;
    message: string;
    sent_at: string;
  }> | null;

  @Column({ type: 'uuid', nullable: true })
  tenant_id: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ticket_ref: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sla_deadline: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_level: number;

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  resolution_time_hours: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
