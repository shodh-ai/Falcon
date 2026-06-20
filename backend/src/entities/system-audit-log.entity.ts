import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AuditAction = 'INSERT' | 'UPDATE' | 'SOFT_DELETE';

@Entity('system_audit_logs')
@Index(['table_name', 'record_id'])
@Index(['changed_at'])
export class SystemAuditLog {
  @PrimaryGeneratedColumn('uuid')
  log_id: string;

  @Column({ length: 100 })
  table_name: string;

  @Column({ type: 'uuid', nullable: true })
  record_id: string | null;

  @Column({ length: 20 })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  old_value: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  new_value: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  changed_by_user_id: string | null;

  @CreateDateColumn({ name: 'changed_at' })
  changed_at: Date;
}
