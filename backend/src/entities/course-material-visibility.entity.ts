import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CourseMaterial } from './course-material.entity';
import { CourseAllocation } from './course-allocation.entity';

@Entity('course_material_visibility')
@Index(['material_id'])
@Index(['allocation_id'])
export class CourseMaterialVisibility {
  @PrimaryGeneratedColumn('uuid')
  visibility_id: string;

  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => CourseMaterial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'material_id' })
  material: CourseMaterial;

  @Column({ type: 'uuid' })
  allocation_id: string;

  @ManyToOne(() => CourseAllocation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'allocation_id' })
  allocation: CourseAllocation;

  @CreateDateColumn()
  created_at: Date;
}
