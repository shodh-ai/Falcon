import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type ExamApplicationType = 'RE_EVALUATION' | 'BACKLOG';
export type ExamApplicationFeeStatus = 'PENDING' | 'PAID' | 'WAIVED';
export type ExamApplicationStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity('exam_applications')
@Index(['student_user_id'])
@Index(['status'])
export class ExamApplication {
  @PrimaryGeneratedColumn('uuid')
  exam_application_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'int' })
  subject_id: number;

  @Column({ length: 20 })
  application_type: ExamApplicationType;

  @Column({ length: 20, default: 'PENDING' })
  fee_status: ExamApplicationFeeStatus;

  @Column({ length: 20, default: 'PENDING' })
  status: ExamApplicationStatus;

  @Column({ type: 'uuid', nullable: true })
  finance_demand_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
