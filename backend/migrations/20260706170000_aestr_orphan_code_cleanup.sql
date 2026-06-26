-- Force re-sync AESTR workload on environments where 20260706160000 already ran
-- with legacy spaced codes (e.g. CP 325 vs CP325).

DO $$
DECLARE
  r RECORD;
  m RECORD;
BEGIN
  IF to_regclass('public.academic_subjects') IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _spaced_subject_merge ON COMMIT DROP AS
  SELECT spaced.subject_id AS drop_id, canon.subject_id AS keep_id
    FROM academic_subjects spaced
    JOIN academic_subjects canon
      ON canon.subject_code = UPPER(REPLACE(TRIM(spaced.subject_code), ' ', ''))
     AND canon.subject_id <> spaced.subject_id
   WHERE spaced.subject_code ~ '\s';

  IF EXISTS (SELECT 1 FROM _spaced_subject_merge) THEN
    DELETE FROM academic_course_allocations drop_a
     USING _spaced_subject_merge sm, academic_course_allocations keep_a
     WHERE drop_a.subject_id = sm.drop_id
       AND keep_a.subject_id = sm.keep_id
       AND keep_a.tenant_id = drop_a.tenant_id
       AND keep_a.program_name IS NOT DISTINCT FROM drop_a.program_name
       AND keep_a.semester IS NOT DISTINCT FROM drop_a.semester
       AND keep_a.academic_year = drop_a.academic_year;

    FOR m IN SELECT drop_id, keep_id FROM _spaced_subject_merge LOOP
      FOR r IN
        SELECT tc.table_schema, tc.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.table_schema = tc.table_schema
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = 'public'
           AND ccu.table_name = 'academic_subjects'
           AND ccu.column_name = 'subject_id'
      LOOP
        EXECUTE format(
          'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
          r.table_schema, r.table_name, r.column_name, r.column_name
        ) USING m.keep_id, m.drop_id;
      END LOOP;
    END LOOP;

    DELETE FROM academic_subjects s
     USING _spaced_subject_merge sm
     WHERE s.subject_id = sm.drop_id;
  END IF;
END $$;

UPDATE academic_course_allocations a
   SET course_id = canon.course_id
  FROM academic_courses spaced
  JOIN academic_courses canon
    ON canon.tenant_id = spaced.tenant_id
   AND canon.course_code = UPPER(REPLACE(TRIM(spaced.course_code), ' ', ''))
   AND canon.course_id <> spaced.course_id
 WHERE a.course_id = spaced.course_id
   AND spaced.course_code ~ '\s';

DELETE FROM academic_courses spaced
 WHERE spaced.course_code ~ '\s'
   AND EXISTS (
     SELECT 1 FROM academic_courses canon
     WHERE canon.tenant_id = spaced.tenant_id
       AND canon.course_code = UPPER(REPLACE(TRIM(spaced.course_code), ' ', ''))
       AND canon.course_id <> spaced.course_id
   );

-- Orphan spaced-code cleanup only. Full workload refresh: re-apply 20260706160000 on fresh DB
-- or delete schema_migrations row for that file and run db:migrate (dev only).
