import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hr_holidays')
export class HrHoliday {
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

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
