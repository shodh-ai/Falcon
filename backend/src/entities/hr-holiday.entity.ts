import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('hr_holidays')
export class HrHoliday extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  holiday_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 50, default: 'MANDATORY' })
  type: 'MANDATORY' | 'RESTRICTED';

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true })
  entity_id: number | null;

  @Column({ type: 'varchar', length: 50, default: 'ALL' })
  applicable_to: 'ALL' | 'STUDENT' | 'STAFF';

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
