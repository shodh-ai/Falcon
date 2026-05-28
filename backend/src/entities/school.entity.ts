import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Campus } from './campus.entity';

@Entity('schools')
@Index(['campus_id'])
export class School {
  @PrimaryGeneratedColumn()
  school_id: number;

  @Column({ length: 150 })
  school_name: string;

  @Column({ length: 20, nullable: true })
  school_code: string;

  @ManyToOne(() => Campus)
  @JoinColumn({ name: 'campus_id' })
  campus: Campus;

  @Column({ nullable: true })
  campus_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
