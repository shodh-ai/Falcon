-- Normalize course/subject codes: remove spaces, merge exact duplicates (e.g. CP 325 + CP325 -> CP325).
-- Keeps all distinct subjects; only collapses rows that differ solely by whitespace in the code.

DO $$
DECLARE
  r RECORD;
  m RECORD;
  v_merged INT := 0;
BEGIN
  IF to_regclass('public.academic_courses') IS NULL THEN
    RAISE NOTICE 'Skipping course-code normalization: academic_courses not found';
    RETURN;
  END IF;

  CREATE TEMP TABLE _subject_merge ON COMMIT DROP AS
  WITH normalized AS (
    SELECT subject_id,
           subject_code,
           UPPER(REPLACE(TRIM(subject_code), ' ', '')) AS normalized_code
      FROM academic_subjects
     WHERE deleted_at IS NULL
  ),
  ranked AS (
    SELECT subject_id,
           subject_code,
           normalized_code,
           ROW_NUMBER() OVER (
             PARTITION BY normalized_code
             ORDER BY
               CASE WHEN subject_code NOT LIKE '% %' THEN 0 ELSE 1 END,
               subject_id
           ) AS rn
      FROM normalized
  )
  SELECT drop_s.subject_id AS drop_id,
         keep_s.subject_id AS keep_id,
         keep_s.normalized_code
    FROM ranked drop_s
    JOIN ranked keep_s
      ON keep_s.normalized_code = drop_s.normalized_code
     AND keep_s.rn = 1
   WHERE drop_s.rn > 1;

  IF EXISTS (SELECT 1 FROM _subject_merge) THEN
    FOR m IN SELECT drop_id, keep_id FROM _subject_merge LOOP
      FOR r IN
        SELECT tc.table_schema,
               tc.table_name,
               kcu.column_name
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
          r.table_schema,
          r.table_name,
          r.column_name,
          r.column_name
        ) USING m.keep_id, m.drop_id;
      END LOOP;
    END LOOP;

    DELETE FROM academic_course_allocations a
     USING academic_course_allocations b
     WHERE a.allocation_id > b.allocation_id
       AND a.tenant_id = b.tenant_id
       AND a.subject_id = b.subject_id
       AND a.program_name IS NOT DISTINCT FROM b.program_name
       AND a.semester IS NOT DISTINCT FROM b.semester
       AND a.academic_year = b.academic_year;

    DELETE FROM academic_subjects s
     USING _subject_merge sm
     WHERE s.subject_id = sm.drop_id;
  END IF;

  UPDATE academic_subjects s
     SET subject_code = UPPER(REPLACE(TRIM(s.subject_code), ' ', ''))
   WHERE s.subject_code ~ '\s'
     AND NOT EXISTS (
       SELECT 1 FROM academic_subjects x
       WHERE x.subject_id <> s.subject_id
         AND x.subject_code = UPPER(REPLACE(TRIM(s.subject_code), ' ', ''))
     );

  CREATE TEMP TABLE _course_merge ON COMMIT DROP AS
  WITH normalized AS (
    SELECT course_id,
           tenant_id,
           course_code,
           UPPER(REPLACE(TRIM(course_code), ' ', '')) AS normalized_code
      FROM academic_courses
  ),
  ranked AS (
    SELECT course_id,
           tenant_id,
           course_code,
           normalized_code,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, normalized_code
             ORDER BY
               CASE WHEN course_code NOT LIKE '% %' THEN 0 ELSE 1 END,
               course_id
           ) AS rn
      FROM normalized
  )
  SELECT drop_c.course_id AS drop_id,
         keep_c.course_id AS keep_id,
         drop_c.tenant_id,
         keep_c.normalized_code
    FROM ranked drop_c
    JOIN ranked keep_c
      ON keep_c.tenant_id = drop_c.tenant_id
     AND keep_c.normalized_code = drop_c.normalized_code
     AND keep_c.rn = 1
   WHERE drop_c.rn > 1;

  GET DIAGNOSTICS v_merged = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM _course_merge) THEN
    DELETE FROM student_course_enrollments drop_e
     USING student_course_enrollments keep_e, _course_merge cm
     WHERE drop_e.course_id = cm.drop_id
       AND keep_e.course_id = cm.keep_id
       AND keep_e.tenant_id = drop_e.tenant_id
       AND keep_e.student_user_id = drop_e.student_user_id;

    DELETE FROM academic_marks drop_m
     USING academic_marks keep_m, _course_merge cm
     WHERE drop_m.course_id = cm.drop_id
       AND keep_m.course_id = cm.keep_id
       AND keep_m.tenant_id = drop_m.tenant_id
       AND keep_m.student_user_id = drop_m.student_user_id
       AND keep_m.exam_type = drop_m.exam_type;

    DELETE FROM academic_timetables drop_t
     USING academic_timetables keep_t, _course_merge cm
     WHERE drop_t.course_id = cm.drop_id
       AND keep_t.course_id = cm.keep_id
       AND keep_t.tenant_id = drop_t.tenant_id
       AND keep_t.day_of_week = drop_t.day_of_week
       AND keep_t.start_time = drop_t.start_time
       AND keep_t.end_time = drop_t.end_time
       AND drop_t.deleted_at IS NULL
       AND keep_t.deleted_at IS NULL;
  END IF;

  FOR m IN SELECT drop_id, keep_id FROM _course_merge LOOP
    FOR r IN
      SELECT tc.table_schema,
             tc.table_name,
             kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
         AND ccu.table_name = 'academic_courses'
         AND ccu.column_name = 'course_id'
    LOOP
      EXECUTE format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
        r.table_schema,
        r.table_name,
        r.column_name,
        r.column_name
      ) USING m.keep_id, m.drop_id;
    END LOOP;
  END LOOP;

  IF to_regclass('public.student_course_enrollments') IS NOT NULL THEN
    DELETE FROM student_course_enrollments a
     USING student_course_enrollments b
     WHERE a.ctid > b.ctid
       AND a.tenant_id = b.tenant_id
       AND a.student_user_id = b.student_user_id
       AND a.course_id = b.course_id
       AND a.semester IS NOT DISTINCT FROM b.semester;
  END IF;

  IF to_regclass('public.academic_marks') IS NOT NULL THEN
    DELETE FROM academic_marks a
     USING academic_marks b
     WHERE a.ctid > b.ctid
       AND a.tenant_id = b.tenant_id
       AND a.student_user_id = b.student_user_id
       AND a.course_id = b.course_id
       AND a.exam_type = b.exam_type;
  END IF;

  IF to_regclass('public.academic_timetables') IS NOT NULL THEN
    DELETE FROM academic_timetables a
     USING academic_timetables b
     WHERE a.timetable_id > b.timetable_id
       AND a.tenant_id = b.tenant_id
       AND a.course_id = b.course_id
       AND a.day_of_week = b.day_of_week
       AND a.start_time = b.start_time
       AND a.end_time = b.end_time
       AND a.deleted_at IS NULL
       AND b.deleted_at IS NULL;
  END IF;

  IF to_regclass('public.course_attendance_logs') IS NOT NULL THEN
    DELETE FROM course_attendance_logs a
     USING course_attendance_logs b
     WHERE a.ctid > b.ctid
       AND a.tenant_id = b.tenant_id
       AND a.course_id = b.course_id
       AND a.faculty_user_id = b.faculty_user_id
       AND a.date = b.date
       AND a.timetable_id IS NOT DISTINCT FROM b.timetable_id;
  END IF;

  DELETE FROM academic_courses c
   USING _course_merge cm
   WHERE c.course_id = cm.drop_id;

  UPDATE academic_courses c
     SET course_code = UPPER(REPLACE(TRIM(c.course_code), ' ', ''))
   WHERE c.course_code ~ '\s'
     AND NOT EXISTS (
       SELECT 1 FROM academic_courses x
       WHERE x.course_id <> c.course_id
         AND x.tenant_id = c.tenant_id
         AND x.course_code = UPPER(REPLACE(TRIM(c.course_code), ' ', ''))
     );

  RAISE NOTICE 'Normalized course codes; merged % duplicate course row(s)', v_merged;
END $$;
