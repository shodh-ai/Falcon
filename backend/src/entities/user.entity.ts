import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from './role.entity';
import { Department } from './department.entity';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['google_id'])
@Index(['role_id'])
@Index(['dept_id'])
export class User {
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

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'dept_id' })
  department: Department;

  @Column({ nullable: true })
  dept_id: number;

  @Column({ length: 255, nullable: true })
  google_id: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
