import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('campuses')
export class Campus extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  campus_id: number;

  @Column({ unique: true, length: 100 })
  campus_name: string;

  @Column({ length: 20, nullable: true })
  campus_code: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
