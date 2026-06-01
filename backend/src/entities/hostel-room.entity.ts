import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, JoinColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('operations_hostel_rooms')
@Index(['hostel_block', 'room_number'], { unique: true })
export class HostelRoom {
  @PrimaryGeneratedColumn()
  room_id: number;

  @Column({ length: 40 })
  hostel_block: string;

  @Column({ length: 20 })
  room_number: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'int', default: 0 })
  occupied: number;

  @Column({ length: 20, default: 'BOYS' })
  gender: string;

  @Column({ length: 20, default: 'AVAILABLE' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  warden_user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warden_user_id' })
  warden: User | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
