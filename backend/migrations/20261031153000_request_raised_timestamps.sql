-- Do not fabricate a submission timestamp for historical requests.
ALTER TABLE staff_gate_passes ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE staff_gate_passes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE hr_employee_appraisals ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
CREATE OR REPLACE FUNCTION record_appraisal_submission_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hr_final_status='HOD_REVIEW' AND NEW.submitted_at IS NULL THEN
    IF TG_OP='INSERT' THEN NEW.submitted_at=clock_timestamp();
    ELSIF OLD.hr_final_status IS DISTINCT FROM 'HOD_REVIEW' THEN NEW.submitted_at=clock_timestamp();
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS appraisal_submission_time ON hr_employee_appraisals;
CREATE TRIGGER appraisal_submission_time BEFORE INSERT OR UPDATE OF hr_final_status ON hr_employee_appraisals
  FOR EACH ROW EXECUTE FUNCTION record_appraisal_submission_time();
