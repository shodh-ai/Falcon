-- Approved existing BaseSoftDeleteEntity field only; no archival actions.
ALTER TABLE academic_course_allocations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
