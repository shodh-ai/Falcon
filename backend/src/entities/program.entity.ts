import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { School } from './school.entity';
import { Department } from './department.entity';

@Entity('iam_programs')
@Index(['school_id'])
@Index(['dept_id'])
export class Program {
  @PrimaryGeneratedColumn()
  program_id: number;

  @Column({ length: 150 })
  program_name: string;

  @Column({ length: 20 })
  program_code: string;

  @Column({ type: 'int', nullable: true })
  duration_years: number;

  @ManyToOne(() => School)
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ nullable: true })
  school_id: number;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'dept_id' })
  department: Department;

  @Column({ nullable: true })
  dept_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
