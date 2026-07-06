import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('student_policy_acknowledgements')
@Unique(['tenant_id', 'student_user_id', 'policy_id'])
export class StudentPolicyAcknowledgement {
  @PrimaryGeneratedColumn('uuid')
  ack_id: string;

  @Column('uuid')
  tenant_id: string;

  @Column('uuid')
  student_user_id: string;

  @Column('uuid')
  policy_id: string;

  @Column('varchar', { nullable: true })
  vote: 'YES' | 'NO' | null;

  @CreateDateColumn()
  acknowledged_at: Date;
}
