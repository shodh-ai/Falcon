-- Force re-sync AESTR workload on environments where 20260706160000 already ran
-- with legacy spaced codes (e.g. CP 325 vs CP325).

DELETE FROM academic_courses spaced
 WHERE spaced.course_code ~ '\s'
   AND EXISTS (
     SELECT 1 FROM academic_courses canon
     WHERE canon.tenant_id = spaced.tenant_id
       AND canon.course_code = UPPER(REPLACE(TRIM(spaced.course_code), ' ', ''))
       AND canon.course_id <> spaced.course_id
   );

DELETE FROM academic_subjects spaced
 WHERE spaced.subject_code ~ '\s'
   AND EXISTS (
     SELECT 1 FROM academic_subjects canon
     WHERE canon.subject_code = UPPER(REPLACE(TRIM(spaced.subject_code), ' ', ''))
       AND canon.subject_id <> spaced.subject_id
   );

-- Orphan spaced-code cleanup only. Full workload refresh: re-apply 20260706160000 on fresh DB
-- or delete schema_migrations row for that file and run db:migrate (dev only).
