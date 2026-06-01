import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicCourse } from './academic-course.entity';
import { User } from './user.entity';

export type CourseEnrollmentStatus = 'ENROLLED' | 'COMPLETED' | 'FAILED';

@Entity('student_course_enrollments')
@Index(['tenant_id', 'student_user_id'])
@Index(['tenant_id', 'student_user_id', 'course_id'], { unique: true })
export class StudentCourseEnrollment extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  enrollment_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_user_id' })
  student: User;

  @Column({ type: 'uuid' })
  course_id: string;

  @ManyToOne(() => AcademicCourse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: AcademicCourse;

  @Column({ type: 'int' })
  semester: number;

  @Column({ type: 'varchar', length: 50, default: 'ENROLLED' })
  status: CourseEnrollmentStatus;

  @Column({ type: 'varchar', length: 5, nullable: true })
  grade: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  grade_points: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  attendance_percent: string;
}
