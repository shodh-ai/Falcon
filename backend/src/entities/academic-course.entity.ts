import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('academic_courses')
@Index(['tenant_id', 'course_code'], { unique: true })
export class AcademicCourse extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  course_id: string;

  @Column({ type: 'varchar', length: 50 })
  course_code: string;

  @Column({ type: 'varchar', length: 255 })
  course_name: string;

  @Column({ type: 'int' })
  credits: number;

  @Column({ type: 'boolean', default: false })
  is_elective: boolean;
}
