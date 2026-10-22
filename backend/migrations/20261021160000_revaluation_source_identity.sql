-- Preserve the chosen published examination across reassessment and publication.
-- Historical applications remain nullable and retain unique-source validation.
ALTER TABLE exam_applications
  ADD COLUMN IF NOT EXISTS source_result_id UUID,
  ADD COLUMN IF NOT EXISTS source_session_id UUID,
  ADD COLUMN IF NOT EXISTS source_mark_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_applications'::regclass AND conname = 'fk_exam_application_source_result') THEN
    ALTER TABLE exam_applications ADD CONSTRAINT fk_exam_application_source_result
      FOREIGN KEY (source_result_id) REFERENCES academic_exam_results(result_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_applications'::regclass AND conname = 'fk_exam_application_source_session') THEN
    ALTER TABLE exam_applications ADD CONSTRAINT fk_exam_application_source_session
      FOREIGN KEY (source_session_id) REFERENCES exam_result_sessions(session_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_applications'::regclass AND conname = 'fk_exam_application_source_mark') THEN
    ALTER TABLE exam_applications ADD CONSTRAINT fk_exam_application_source_mark
      FOREIGN KEY (source_mark_id) REFERENCES academic_marks(mark_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_applications'::regclass AND conname = 'chk_exam_application_source_identity') THEN
    ALTER TABLE exam_applications ADD CONSTRAINT chk_exam_application_source_identity
      CHECK (source_result_id IS NOT NULL OR (source_session_id IS NULL AND source_mark_id IS NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_exam_application_source_result
  ON exam_applications(tenant_id, student_user_id, source_result_id);
