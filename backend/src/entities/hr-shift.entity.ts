import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hr_shifts')
export class HrShift {
  @PrimaryGeneratedColumn('uuid')
  shift_id: string;

  @Column({ type: 'varchar', length: 50 })
  shift_name: string;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'int', default: 15 })
  grace_period_mins: number;

  @Column({ type: 'numeric', precision: 4, scale: 2, default: 4 })
  half_day_min_hours: number;

  @Column({ type: 'numeric', precision: 4, scale: 2, default: 8 })
  full_day_min_hours: number;

  @Column({ type: 'int', nullable: true })
  entity_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
