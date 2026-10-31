-- Existing requests retain their recorded routing. New regularizations use the
-- explicit HOD/HR exception without changing leave, OD or comp-off policies.
ALTER TABLE hr_department_request_routes
  ADD COLUMN IF NOT EXISTS policy varchar(32) NOT NULL DEFAULT 'DEPARTMENT';
