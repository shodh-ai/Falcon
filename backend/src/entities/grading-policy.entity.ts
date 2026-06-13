import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

/**
 * Dynamic grading rules so the registrar can change SGPA/CGPA thresholds
 * from the admin UI without a redeploy. The `rules` JSON typically holds
 * an array of `{ minPercent, maxPercent, grade, gradePoints }` plus any
 * formula constants the university defines later.
 */
@Entity('academic_grading_policies')
@Index(['program_id'])
@Index(['effective_from'])
export class GradingPolicy extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  policy_id: number;

  @Column({ length: 120 })
  policy_name: string;

  @Column({ type: 'int', nullable: true })
  program_id: number;

  @Column({ type: 'date' })
  effective_from: string;

  @Column({ type: 'date', nullable: true })
  effective_to: string;

  @Column({ type: 'jsonb' })
  rules: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
