import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('hr_override_logs')
export class HrOverrideLog {
  @PrimaryGeneratedColumn('uuid')
  log_id: string;

  @Column({ type: 'varchar' })
  tenant_id: string;

  @Column({ type: 'varchar' })
  employee_id: string;

  @Column({ type: 'varchar', nullable: true })
  assigned_approver: string | null;

  @Column({ type: 'varchar', nullable: true })
  bypassed_by: string | null;

  @Column({ type: 'varchar' })
  type_of_action: string;

  @Column({ type: 'varchar' })
  type_of_request: string;

  @CreateDateColumn()
  date_and_time: Date;
}
