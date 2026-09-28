-- Remove only the known launch-testing artifacts created through Supriya Sarkar's
-- faculty workspace. Official identity, HR profile, course allocations and
-- timetable rows are deliberately preserved.

BEGIN;

CREATE TEMP TABLE supriya_test_reset_target ON COMMIT DROP AS
SELECT u.user_id, u.tenant_id
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id
WHERE t.subdomain = 'sgvu'
  AND lower(u.official_email) = 'supriya.sarkar@mygyanvihar.com'
  AND u.deleted_at IS NULL;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM supriya_test_reset_target) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active SGVU Supriya Sarkar account';
  END IF;
END $$;

INSERT INTO system_audit_logs (
  table_name, record_id, action, old_value, new_value, changed_by_user_id
)
SELECT
  'course_attendance_logs', l.log_id, 'SOFT_DELETE', to_jsonb(l),
  jsonb_build_object(
    'reason', 'Authorized Pharmacy faculty launch-test reset',
    'migration', '20260928160000_reset_supriya_faculty_test_data.sql'
  ), t.user_id
FROM course_attendance_logs l
JOIN supriya_test_reset_target t
  ON t.tenant_id = l.tenant_id AND t.user_id = l.faculty_user_id
WHERE l.date = DATE '2026-09-28';

INSERT INTO system_audit_logs (
  table_name, record_id, action, old_value, new_value, changed_by_user_id
)
SELECT
  'course_modules', m.module_id, 'SOFT_DELETE', to_jsonb(m),
  jsonb_build_object(
    'reason', 'Authorized Pharmacy faculty launch-test reset',
    'migration', '20260928160000_reset_supriya_faculty_test_data.sql'
  ), t.user_id
FROM course_modules m
JOIN supriya_test_reset_target t
  ON t.tenant_id = m.tenant_id AND t.user_id = m.faculty_user_id
WHERE lower(btrim(m.title)) = 'test';

INSERT INTO system_audit_logs (
  table_name, record_id, action, old_value, new_value, changed_by_user_id
)
SELECT
  'faculty_question_bank', q.question_id, 'SOFT_DELETE', to_jsonb(q),
  jsonb_build_object(
    'reason', 'Authorized Pharmacy faculty launch-test reset',
    'migration', '20260928160000_reset_supriya_faculty_test_data.sql'
  ), t.user_id
FROM faculty_question_bank q
JOIN supriya_test_reset_target t
  ON t.tenant_id = q.tenant_id AND t.user_id = q.faculty_user_id
WHERE lower(btrim(q.question_text)) = 'test is the real test';

DELETE FROM course_attendance_logs l
USING supriya_test_reset_target t
WHERE t.tenant_id = l.tenant_id
  AND t.user_id = l.faculty_user_id
  AND l.date = DATE '2026-09-28';

DELETE FROM course_modules m
USING supriya_test_reset_target t
WHERE t.tenant_id = m.tenant_id
  AND t.user_id = m.faculty_user_id
  AND lower(btrim(m.title)) = 'test';

DELETE FROM faculty_question_bank q
USING supriya_test_reset_target t
WHERE t.tenant_id = q.tenant_id
  AND t.user_id = q.faculty_user_id
  AND lower(btrim(q.question_text)) = 'test is the real test';

DO $$
DECLARE
  remaining_test_rows INTEGER;
  official_allocations INTEGER;
  official_timetable_rows INTEGER;
BEGIN
  SELECT
    (SELECT COUNT(*)
       FROM course_attendance_logs l
       JOIN supriya_test_reset_target t
         ON t.tenant_id = l.tenant_id AND t.user_id = l.faculty_user_id
      WHERE l.date = DATE '2026-09-28')
    +
    (SELECT COUNT(*)
       FROM course_modules m
       JOIN supriya_test_reset_target t
         ON t.tenant_id = m.tenant_id AND t.user_id = m.faculty_user_id
      WHERE lower(btrim(m.title)) = 'test')
    +
    (SELECT COUNT(*)
       FROM faculty_question_bank q
       JOIN supriya_test_reset_target t
         ON t.tenant_id = q.tenant_id AND t.user_id = q.faculty_user_id
      WHERE lower(btrim(q.question_text)) = 'test is the real test')
  INTO remaining_test_rows;

  SELECT COUNT(*)
  INTO official_allocations
  FROM academic_course_allocations a
  JOIN supriya_test_reset_target t
    ON t.tenant_id = a.tenant_id AND t.user_id = a.faculty_user_id
  WHERE a.academic_year = '2026-2027' AND a.status = 'ACTIVE';

  SELECT COUNT(*)
  INTO official_timetable_rows
  FROM academic_timetables tt
  JOIN supriya_test_reset_target t
    ON t.tenant_id = tt.tenant_id AND t.user_id = tt.faculty_user_id
  WHERE tt.deleted_at IS NULL;

  IF remaining_test_rows <> 0 THEN
    RAISE EXCEPTION 'Supriya faculty test reset left % matching rows', remaining_test_rows;
  END IF;
  IF official_allocations <> 3 THEN
    RAISE EXCEPTION 'Expected 3 preserved official Supriya allocations, found %', official_allocations;
  END IF;
  IF official_timetable_rows <> 4 THEN
    RAISE EXCEPTION 'Expected 4 preserved official Supriya timetable rows, found %', official_timetable_rows;
  END IF;
END $$;

COMMIT;
