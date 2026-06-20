import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('alumni_events')
export class AlumniEvent extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  event_id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'timestamptz' })
  event_date: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  venue: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_published: boolean;

  @CreateDateColumn()
  created_at: Date;
}
