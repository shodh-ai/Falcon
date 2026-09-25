BEGIN;

ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS hod_reviewed_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS hod_reviewed_by UUID NULL,
  ADD COLUMN IF NOT EXISTS hod_review_comments TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_task_assignments_hod_review_queue
  ON task_assignments(tenant_id, dept_id, status)
  WHERE deleted_at IS NULL AND status = 'PENDING_HOD_APPROVAL';

-- Existing evidence had no department gate. Route it to the HOD queue rather
-- than exposing it directly to IQAC after this migration.
UPDATE task_assignments
SET status = 'PENDING_HOD_APPROVAL',
    version = version + 1
WHERE deleted_at IS NULL
  AND status = 'SUBMITTED';

COMMIT;
