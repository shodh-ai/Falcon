import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicCourse } from './academic-course.entity';
import { User } from './user.entity';

export type CourseAttendanceEntry = {
  student_id: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
};

@Entity('course_attendance_logs')
@Index(['tenant_id', 'course_id', 'date'])
@Index(['tenant_id', 'course_id', 'faculty_user_id', 'date'], { unique: true })
export class CourseAttendanceLog extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  log_id: string;

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

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'jsonb' })
  attendance_data: CourseAttendanceEntry[];
}
