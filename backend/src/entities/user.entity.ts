import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Role } from './role.entity';
import { Department } from './department.entity';
import { BaseTenantEntity } from './base-tenant.entity';
import { UserRole } from './user-role.entity';

@Entity('users')
@Index(['tenant_id', 'email'], { unique: true })
@Index(['google_id'])
@Index(['role_id'])
@Index(['dept_id'])
export class User extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  user_id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ unique: true, length: 255, name: 'official_email' })
  email: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ nullable: true })
  role_id: number;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles: UserRole[];

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'dept_id' })
  department: Department;

  @Column({ nullable: true })
  dept_id: number;

  @Column({ type: 'uuid', nullable: true })
  reporting_officer_id: string | null;

  @Column({ length: 255, nullable: true })
  google_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  password_hash: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  salary_base: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
