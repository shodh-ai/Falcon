-- One-off class moves do not rewrite the recurring academic timetable.
-- All legs of a swap or reshuffle share a group id and are approved atomically.
CREATE TABLE IF NOT EXISTS academic_class_moves (
  move_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_group_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_timetable_id UUID NOT NULL,
  course_id UUID NOT NULL,
  original_faculty_id UUID NOT NULL,
  source_date DATE NOT NULL,
  target_date DATE NOT NULL,
  target_start_time TIME NOT NULL,
  target_end_time TIME NOT NULL,
  target_room VARCHAR(80),
  move_type VARCHAR(20) NOT NULL
    CHECK (move_type IN ('RESCHEDULE', 'SWAP', 'RESHUFFLE')),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_HOD_APPROVAL'
    CHECK (status IN ('PENDING_HOD_APPROVAL', 'APPROVED', 'REJECTED')),
  reason TEXT NOT NULL,
  requested_by_user_id UUID NOT NULL,
  decided_by_user_id UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (target_start_time < target_end_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS academic_class_moves_one_approved_source
  ON academic_class_moves (tenant_id, source_timetable_id, source_date)
  WHERE status = 'APPROVED';

CREATE INDEX IF NOT EXISTS academic_class_moves_projection
  ON academic_class_moves (tenant_id, target_date, status);

CREATE INDEX IF NOT EXISTS academic_class_moves_group
  ON academic_class_moves (tenant_id, change_group_id);

-- The API uses a restricted role in production. Grant only ordinary access to
-- this business table; the migration ledger and schema remain administrator-owned.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'falcon_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE academic_class_moves TO falcon_runtime;
  END IF;
END;
$$;
