import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';
import { Role } from './role.entity';
import { User } from './user.entity';

@Entity('user_roles')
export class UserRole extends BaseSoftDeleteEntity {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @PrimaryColumn({ type: 'int' })
  role_id: number;

  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @ManyToOne(() => User, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;
}
