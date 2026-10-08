-- The faculty remedial workspace remains an active API/UI feature.
-- A prior cleanup migration dropped its table while the service continued to use it.

CREATE TABLE IF NOT EXISTS faculty_remedial_actions (
  remedial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  reason VARCHAR(80) NOT NULL,
  action_taken TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'LOGGED'
    CHECK (status IN ('LOGGED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_remedial_actions_owner
  ON faculty_remedial_actions (tenant_id, faculty_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_faculty_remedial_actions_student
  ON faculty_remedial_actions (tenant_id, student_user_id, created_at DESC);
