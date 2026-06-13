import { DeleteDateColumn } from 'typeorm';

/**
 * Soft-delete mixin — Chairman zero-deletion policy.
 * Rows are never physically removed; deleted_at marks archival.
 */
export abstract class BaseSoftDeleteEntity {
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at: Date | null;
}
