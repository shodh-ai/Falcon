-- Older TypeORM-created indexes can survive the session-identity migration and
-- still reject a regular class and an extra class on the same course/day.
-- Keep exact-session uniqueness in place before removing only that legacy rule.
DO $$
DECLARE
  legacy RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    WHERE i.indrelid = 'public.course_attendance_logs'::regclass
      AND ns.nspname = 'public'
      AND idx.relname = 'idx_course_attendance_logs_session_unique'
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indnkeyatts = 5 AND i.indnatts = 5
      AND i.indpred IS NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY key.position)
        FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
        WHERE key.position <= 4
      ) = ARRAY['tenant_id', 'course_id', 'faculty_user_id', 'date']
      AND regexp_replace(pg_get_expr(i.indexprs, i.indrelid), '\s+', '', 'g') =
        'COALESCE(timetable_id,class_adjustment_id,''00000000-0000-0000-0000-000000000000''::uuid)'
  ) THEN
    RAISE EXCEPTION 'Exact-session attendance uniqueness must be installed before retiring the legacy course/day rule';
  END IF;

  FOR legacy IN
    SELECT idx.relname AS index_name, constraint_row.conname AS constraint_name
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    LEFT JOIN pg_constraint constraint_row
      ON constraint_row.conindid = i.indexrelid AND constraint_row.contype = 'u'
    WHERE i.indrelid = 'public.course_attendance_logs'::regclass
      AND i.indisunique AND NOT i.indisprimary
      AND i.indnkeyatts = 4 AND i.indnatts = 4
      AND i.indexprs IS NULL AND i.indpred IS NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey) AS key(attnum)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ) = ARRAY['course_id', 'date', 'faculty_user_id', 'tenant_id']
  LOOP
    IF legacy.constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.course_attendance_logs DROP CONSTRAINT %I', legacy.constraint_name);
    ELSE
      EXECUTE format('DROP INDEX public.%I', legacy.index_name);
    END IF;
    -- Deliberately no CASCADE: an unexpected dependency must stop migration.
  END LOOP;
END $$;
