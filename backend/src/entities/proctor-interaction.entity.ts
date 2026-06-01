import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type ProctorInteractionType = 'MEETING' | 'MESSAGE' | 'LEAVE_REQUEST';

@Entity('academic_proctor_interactions')
@Index(['student_user_id'])
@Index(['proctor_user_id'])
@Index(['interaction_type'])
export class ProctorInteraction {
  @PrimaryGeneratedColumn('uuid')
  interaction_id: string;

  @Column({ type: 'uuid' })
  student_user_id: string;

  @Column({ type: 'uuid' })
  proctor_user_id: string;

  @Column({ length: 20 })
  interaction_type: ProctorInteractionType;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ length: 20, default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
