import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('owner_access_control')
@Index(['tenant_id', 'user_id'], { unique: true })
export class OwnerAccess extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  access_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  role_label: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
