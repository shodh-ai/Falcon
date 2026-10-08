-- Exam duty swap workflow: Faculty A → Faculty B → Exam Cell → duty transfer + audit.

CREATE TABLE IF NOT EXISTS invigilation_duty_swaps (
  swap_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES faculty_invigilation_assignments(assignment_id) ON DELETE CASCADE,
  requester_faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  target_faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING_TARGET'
    CHECK (status IN (
      'PENDING_TARGET',
      'REJECTED_BY_TARGET',
      'PENDING_EXAM_CELL',
      'APPROVED',
      'REJECTED_BY_EXAM_CELL',
      'CANCELLED'
    )),
  target_comment TEXT NULL,
  target_responded_at TIMESTAMPTZ NULL,
  exam_cell_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  exam_cell_comment TEXT NULL,
  exam_cell_resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_invigilation_duty_swaps_distinct_faculty
    CHECK (requester_faculty_user_id <> target_faculty_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invigilation_duty_swaps_open_assignment
  ON invigilation_duty_swaps (tenant_id, assignment_id)
  WHERE deleted_at IS NULL
    AND status IN ('PENDING_TARGET', 'PENDING_EXAM_CELL');

CREATE INDEX IF NOT EXISTS idx_invigilation_duty_swaps_target_status
  ON invigilation_duty_swaps (tenant_id, target_faculty_user_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invigilation_duty_swaps_requester
  ON invigilation_duty_swaps (tenant_id, requester_faculty_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invigilation_duty_swaps_exam_cell
  ON invigilation_duty_swaps (tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'PENDING_EXAM_CELL';

CREATE TABLE IF NOT EXISTS invigilation_duty_swap_audits (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  swap_id UUID NOT NULL REFERENCES invigilation_duty_swaps(swap_id) ON DELETE CASCADE,
  actor_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invigilation_duty_swap_audits_swap
  ON invigilation_duty_swap_audits (swap_id, created_at DESC);
