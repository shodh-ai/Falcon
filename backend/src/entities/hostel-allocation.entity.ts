import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

export type HostelAllocationStatus = 'ACTIVE' | 'VACATED';

@Entity('hostel_allocations')
@Index(['student_user_id'], { unique: true })
@Index(['room_id'])
@Index(['status'])
export class HostelAllocation extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  allocation_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'int' })
  room_id: number;

  @Column({ length: 20, nullable: true })
  bed_number: string;

  @Column({ length: 40 })
  mess_plan: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string;

  @Column({ length: 20, default: 'ACTIVE' })
  status: HostelAllocationStatus;

  @Column({ type: 'uuid', nullable: true })
  warden_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
