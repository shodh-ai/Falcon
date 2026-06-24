import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('academic_course_allocations')
@Index(['tenant_id', 'academic_year'])
export class CourseAllocation extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  allocation_id: string;

  @Column({ type: 'int' })
  subject_id: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  program_name: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  semester: string | null;

  @Column({ type: 'uuid', nullable: true })
  faculty_user_id: string | null;

  @Column({ type: 'varchar', length: 20 })
  academic_year: string;

  @Column({ type: 'uuid', nullable: true })
  course_id: string | null;

  @Column({ type: 'varchar', length: 50, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
