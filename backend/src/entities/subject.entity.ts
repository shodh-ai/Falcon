import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('academic_subjects')
@Index(['subject_code'], { unique: true })
@Index(['program_id'])
export class Subject {
  @PrimaryGeneratedColumn()
  subject_id: number;

  @Column({ length: 30 })
  subject_code: string;

  @Column({ length: 200 })
  subject_name: string;

  @Column({ type: 'int' })
  program_id: number;

  @Column({ type: 'int', nullable: true })
  semester: number;

  @Column({ type: 'int', nullable: true })
  credits: number;

  @Column({ length: 30, default: 'THEORY' })
  subject_type: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
