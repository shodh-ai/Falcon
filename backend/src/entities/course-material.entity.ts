import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicCourse } from './academic-course.entity';
import { User } from './user.entity';

@Entity('course_materials')
@Index(['tenant_id', 'course_id'])
export class CourseMaterial extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  material_id: string;

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

  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'text', nullable: true })
  file_key: string | null;

  @CreateDateColumn()
  uploaded_at: Date;
}
