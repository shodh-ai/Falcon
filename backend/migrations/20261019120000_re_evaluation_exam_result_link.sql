-- Preserve an exact published-result reference for each new re-evaluation.
-- Legacy applications remain unlinked; never guess an exam or rewrite marks.
ALTER TABLE exam_applications ADD COLUMN IF NOT EXISTS exam_result_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'exam_applications'::regclass
      AND conname = 'fk_exam_applications_exam_result'
  ) THEN
    ALTER TABLE exam_applications
      ADD CONSTRAINT fk_exam_applications_exam_result
      FOREIGN KEY (exam_result_id) REFERENCES academic_exam_results(result_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_applications_exam_result
  ON exam_applications (exam_result_id) WHERE exam_result_id IS NOT NULL;
