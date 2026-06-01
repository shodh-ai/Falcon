import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicCourse } from './academic-course.entity';
import { User } from './user.entity';

export type CourseModuleStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

@Entity('course_modules')
@Index(['tenant_id', 'course_id', 'module_number'], { unique: true })
export class CourseModule extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  module_id: string;

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

  @Column({ type: 'int' })
  module_number: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: CourseModuleStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
