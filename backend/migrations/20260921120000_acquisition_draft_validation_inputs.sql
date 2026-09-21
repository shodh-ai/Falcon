-- Permit requesters to retain intentionally invalid draft quantities so the
-- server-side validation workflow can explain the error. Non-draft versions
-- remain protected at the database boundary.

ALTER TABLE acq_lines
  DROP CONSTRAINT IF EXISTS acq_lines_quantity_check;

ALTER TABLE acq_lines
  ADD CONSTRAINT acq_lines_quantity_check CHECK (quantity >= 0);

CREATE OR REPLACE FUNCTION acq_require_valid_lines_before_draft_exit()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' AND EXISTS (
    SELECT 1
    FROM acq_lines l
    WHERE l.acquisition_version_id = NEW.acquisition_version_id
      AND l.line_status = 'ACTIVE'
      AND l.quantity <= 0
  ) THEN
    RAISE EXCEPTION
      'ACQUISITION_VALIDATION_REQUIRED: active line quantities must be greater than zero';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_acq_valid_lines_before_draft_exit
  ON acq_request_versions;

CREATE TRIGGER tr_acq_valid_lines_before_draft_exit
BEFORE UPDATE OF status ON acq_request_versions
FOR EACH ROW EXECUTE FUNCTION acq_require_valid_lines_before_draft_exit();
