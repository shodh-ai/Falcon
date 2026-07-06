import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicCourse } from './academic-course.entity';
import { User } from './user.entity';

@Entity('academic_assignments')
@Index(['tenant_id', 'course_id', 'due_date'])
export class AcademicAssignment extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  assignment_id: string;

  @Column({ type: 'uuid' })
  course_id: string;

  @ManyToOne(() => AcademicCourse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: AcademicCourse;

  @Column({ type: 'uuid' })
  faculty_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'faculty_user_id' })
  faculty: User;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  reference_file_path: string | null;

  @Column({ type: 'text', nullable: true })
  reference_file_key: string | null;

  @Column({ type: 'int' })
  max_marks: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  start_date: Date;

  @Column({ type: 'timestamptz' })
  due_date: Date;

  @CreateDateColumn()
  created_at: Date;
}
