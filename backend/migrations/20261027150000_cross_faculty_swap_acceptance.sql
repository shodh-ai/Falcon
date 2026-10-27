-- Preserve existing class moves while adding the counterpart's acceptance step.
ALTER TABLE academic_class_moves
  DROP CONSTRAINT IF EXISTS academic_class_moves_status_check;
ALTER TABLE academic_class_moves
  ADD CONSTRAINT academic_class_moves_status_check
  CHECK (status IN ('PENDING_FACULTY_ACCEPTANCE', 'PENDING_HOD_APPROVAL',
                   'APPROVED', 'REJECTED'));

ALTER TABLE academic_class_moves
  ADD COLUMN IF NOT EXISTS counterpart_responded_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS counterpart_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS counterpart_response VARCHAR(7);

ALTER TABLE academic_class_moves
  ADD CONSTRAINT academic_class_moves_counterpart_response_check
  CHECK (counterpart_response IS NULL OR counterpart_response IN ('ACCEPT', 'DECLINE'));

CREATE INDEX IF NOT EXISTS academic_class_moves_faculty_offer
  ON academic_class_moves (tenant_id, original_faculty_id, status)
  WHERE status = 'PENDING_FACULTY_ACCEPTANCE';
