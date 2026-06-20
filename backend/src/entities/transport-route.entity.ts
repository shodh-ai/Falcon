import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('operations_transport_routes')
export class TransportRoute extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  route_id: number;

  @Column({ length: 30 })
  route_code: string;

  @Column({ length: 150 })
  route_name: string;

  @Column({ type: 'jsonb', nullable: true })
  stops: Record<string, unknown> | null;

  @Column({ length: 30, nullable: true })
  bus_number: string;

  @Column({ type: 'int', nullable: true })
  capacity: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  annual_fee: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
