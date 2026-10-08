-- UOS Wave 3: SIS DOFA — Grade Change + Curriculum / BoS

CREATE TABLE IF NOT EXISTS sis_grade_change_requests (
  change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  course_code VARCHAR(40) NOT NULL,
  course_name TEXT,
  from_grade VARCHAR(10) NOT NULL,
  to_grade VARCHAR(10) NOT NULL,
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING_HOD',
  hod_by UUID REFERENCES users(user_id),
  hod_at TIMESTAMPTZ,
  dean_by UUID REFERENCES users(user_id),
  dean_at TIMESTAMPTZ,
  coe_by UUID REFERENCES users(user_id),
  coe_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sis_curriculum_proposals (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  program_code VARCHAR(40),
  course_code VARCHAR(40),
  syllabus_pdf_path TEXT NOT NULL,
  effective_term VARCHAR(20),
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES users(user_id),
  bos_signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
  dean_by UUID REFERENCES users(user_id),
  dean_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
