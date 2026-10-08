-- Rollback helper for department import runs (use via rollback-department.js preferred)
-- Replace :run_id with the import run UUID from department_import_runs / MIGRATION_SUMMARY.md

BEGIN;

DELETE FROM academic_course_allocations
WHERE import_run_id = :'run_id';

UPDATE department_import_runs
SET status = 'ROLLED_BACK', rolled_back_at = NOW()
WHERE run_id = :'run_id';

COMMIT;
