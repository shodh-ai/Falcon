-- The fresh-database bootstrap creates these tables from TypeORM entities before
-- 20260623100000 runs. Its CREATE TABLE IF NOT EXISTS therefore cannot add the
-- UNIQUE constraints required by the result-session and student-report upserts.
-- Restore the original migration's intended guarantees without changing records.
-- An equivalent valid, immediate, non-partial unique index already satisfies
-- ON CONFLICT, regardless of its name, key order or optional INCLUDE columns.
-- Existing duplicates deliberately fail this migration for operator review;
-- never discard results or choose an arbitrary record to resolve a duplicate.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.exam_result_sessions'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 4
      AND ARRAY(
        SELECT a.attname::text
        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinal)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ordinal <= i.indnkeyatts
        ORDER BY a.attname
      ) = ARRAY['course_id', 'exam_type', 'semester', 'tenant_id']::text[]
  ) THEN
    CREATE UNIQUE INDEX uq_exam_result_sessions_scope
      ON public.exam_result_sessions (tenant_id, course_id, exam_type, semester);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.student_exam_reports'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts = 2
      AND ARRAY(
        SELECT a.attname::text
        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinal)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ordinal <= i.indnkeyatts
        ORDER BY a.attname
      ) = ARRAY['session_id', 'student_user_id']::text[]
  ) THEN
    CREATE UNIQUE INDEX uq_student_exam_reports_session_student
      ON public.student_exam_reports (session_id, student_user_id);
  END IF;
END $$;
