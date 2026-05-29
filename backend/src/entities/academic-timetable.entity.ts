import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicCourse } from './academic-course.entity';
import { User } from './user.entity';

@Entity('academic_timetables')
@Index(['tenant_id', 'course_id', 'day_of_week'])
export class AcademicTimetable extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  timetable_id: string;

  @Column({ type: 'uuid' })
  course_id: string;

  @ManyToOne(() => AcademicCourse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: AcademicCourse;

  @Column({ type: 'int' })
  day_of_week: number;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  room: string | null;

  @Column({ type: 'uuid', nullable: true })
  faculty_user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'faculty_user_id' })
  faculty: User | null;
}
