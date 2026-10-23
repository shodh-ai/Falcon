-- Exact declaration provenance. Legacy result IDs and snapshots remain untouched.
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS result_session_id UUID;
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS source_mark_id UUID;
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS source_report_id UUID;
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS source_mark_updated_at TIMESTAMPTZ;
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS grading_policy_snapshot JSONB;
ALTER TABLE academic_exam_results ADD COLUMN IF NOT EXISTS pass_marks_snapshot NUMERIC(6,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='academic_exam_results'::regclass AND conname='fk_exam_result_session_source') THEN
    ALTER TABLE academic_exam_results ADD CONSTRAINT fk_exam_result_session_source
      FOREIGN KEY (result_session_id) REFERENCES exam_result_sessions(session_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='academic_exam_results'::regclass AND conname='fk_exam_result_mark_source') THEN
    ALTER TABLE academic_exam_results ADD CONSTRAINT fk_exam_result_mark_source
      FOREIGN KEY (source_mark_id) REFERENCES academic_marks(mark_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='academic_exam_results'::regclass AND conname='fk_exam_result_report_source') THEN
    ALTER TABLE academic_exam_results ADD CONSTRAINT fk_exam_result_report_source
      FOREIGN KEY (source_report_id) REFERENCES student_exam_reports(report_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Older installations use this coarse key. Keep it for legacy rows only;
-- a different declared session must never replace an existing attempt's ID.
DO $$
DECLARE idx record;
BEGIN
  SELECT i.indisunique, pg_get_indexdef(i.indexrelid) AS definition INTO idx
  FROM pg_index i JOIN pg_class n ON n.oid=i.indexrelid
  WHERE i.indrelid='academic_exam_results'::regclass AND n.relname='uq_academic_exam_results_course_exam';
  IF FOUND THEN
    IF NOT idx.indisunique OR idx.definition NOT LIKE '%(tenant_id, student_user_id, course_id, exam_type)%' THEN
      RAISE EXCEPTION 'Unexpected legacy exam result index; review its definition before migration';
    END IF;
    IF idx.definition NOT LIKE '%result_session_id IS NULL%' THEN
      DROP INDEX uq_academic_exam_results_course_exam;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_exam_results_course_exam
  ON academic_exam_results (tenant_id, student_user_id, course_id, exam_type)
  WHERE tenant_id IS NOT NULL AND course_id IS NOT NULL AND exam_type IS NOT NULL AND result_session_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_exam_results_session_student
  ON academic_exam_results (result_session_id, student_user_id)
  WHERE result_session_id IS NOT NULL AND deleted_at IS NULL;
