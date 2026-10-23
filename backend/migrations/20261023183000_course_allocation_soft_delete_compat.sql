-- CourseAllocation inherits deleted_at in TypeORM. Older production databases
-- created this table before that mixin and fail on every entity SELECT.
ALTER TABLE academic_course_allocations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_academic_course_allocations_active
  ON academic_course_allocations(tenant_id, course_id, allocation_id)
  WHERE deleted_at IS NULL;
