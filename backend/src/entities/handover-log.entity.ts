import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { User } from './user.entity';

@Entity('handover_log')
export class HandoverLog extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  handover_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'from_user' })
  from_user_entity: User;

  @Column({ name: 'from_user' })
  from_user: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'to_user' })
  to_user_entity: User;

  @Column({ name: 'to_user' })
  to_user: string;

  @CreateDateColumn({ name: 'handover_date' })
  handover_date: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performed_by' })
  performed_by_entity: User;

  @Column({ name: 'performed_by' })
  performed_by: string;

  @Column({ type: 'text', nullable: true })
  notes: string;
}
