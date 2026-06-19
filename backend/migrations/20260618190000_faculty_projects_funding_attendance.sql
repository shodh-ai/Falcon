-- Faculty project funding workflow + guide students + attendance override queue.

ALTER TABLE faculty_project_guides
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS funding_allocated NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funding_consumed NUMERIC(12, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faculty_project_guides' AND column_name = 'student_user_id') THEN
    ALTER TABLE faculty_project_guides ALTER COLUMN student_user_id DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_guide_students (
  guide_id UUID NOT NULL REFERENCES faculty_project_guides(guide_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  grade VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guide_id, student_user_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faculty_project_guides' AND column_name = 'student_user_id') THEN
    EXECUTE 'INSERT INTO project_guide_students (guide_id, student_user_id, tenant_id)
             SELECT g.guide_id, g.student_user_id, g.tenant_id
             FROM faculty_project_guides g
             WHERE g.student_user_id IS NOT NULL
             ON CONFLICT (guide_id, student_user_id) DO NOTHING';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_funding_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES faculty_project_guides(guide_id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  purpose TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_HOD'
    CHECK (status IN (
      'PENDING_HOD',
      'APPROVED_HOD',
      'REJECTED_HOD',
      'APPROVED_DEAN',
      'REJECTED_DEAN',
      'TRANSFERRED'
    )),
  hod_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  hod_commit_message TEXT,
  dean_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  dean_commit_message TEXT,
  accountant_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_funding_tenant_status
  ON project_funding_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_project_guide_students_guide
  ON project_guide_students(guide_id);

CREATE TABLE IF NOT EXISTS course_attendance_overrides (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_attendance_overrides_pending
  ON course_attendance_overrides(tenant_id, status);
