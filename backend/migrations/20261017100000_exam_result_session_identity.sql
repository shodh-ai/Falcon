-- Repair the result-session identity that was declared by the original
-- migration but could be omitted when TypeORM bootstrapped the table first.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM exam_result_sessions
    GROUP BY tenant_id, course_id, exam_type, semester
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add exam_result_sessions identity: duplicate tenant/course/exam/semester rows exist';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_result_sessions_identity
    ON exam_result_sessions (tenant_id, course_id, exam_type, semester);
END
$$;
