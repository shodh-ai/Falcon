-- The original result-control migration declared this identity, but an earlier
-- TypeORM table bootstrap could leave it out. Preserve all existing reports.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM student_exam_reports
    GROUP BY session_id, student_user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add student_exam_reports identity: duplicate session/student reports exist';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_student_exam_reports_identity
    ON student_exam_reports (session_id, student_user_id);
END
$$;
