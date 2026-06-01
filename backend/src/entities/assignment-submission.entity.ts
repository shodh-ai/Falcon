import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';
import { AcademicAssignment } from './academic-assignment.entity';
import { User } from './user.entity';

@Entity('assignment_submissions')
@Index(['tenant_id', 'assignment_id', 'student_user_id'], { unique: true })
export class AssignmentSubmission extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  submission_id: string;

  @Column({ type: 'uuid' })
  assignment_id: string;

  @ManyToOne(() => AcademicAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: AcademicAssignment;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_user_id' })
  student: User;

  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'text', nullable: true })
  file_key: string | null;

  @CreateDateColumn()
  submitted_at: Date;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  marks_awarded: string | null;

  @Column({ type: 'text', nullable: true })
  faculty_remarks: string | null;
}
