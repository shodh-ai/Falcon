-- Student portal: extracurriculars, discipline, exit clearances

CREATE TABLE IF NOT EXISTS student_extracurriculars (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('NCC', 'NSS', 'SODECA', 'OTHER')),
  details TEXT,
  credits_awarded INT NOT NULL DEFAULT 0,
  logged_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_extracurriculars_student
  ON student_extracurriculars(tenant_id, student_user_id, activity_type);

CREATE TABLE IF NOT EXISTS student_discipline_records (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  incident_type VARCHAR(100) NOT NULL,
  description TEXT,
  action_taken TEXT,
  date_logged DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_discipline_student
  ON student_discipline_records(tenant_id, student_user_id, date_logged DESC);

CREATE TABLE IF NOT EXISTS student_exit_clearances (
  clearance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  library_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  finance_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  hostel_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  dept_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  alumni_converted BOOLEAN NOT NULL DEFAULT FALSE,
  degree_issued_date DATE,
  linkedin_url TEXT,
  placement_organization VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id)
);

-- Sample extracurricular + discipline rows for active students (smoke data)
INSERT INTO student_extracurriculars (tenant_id, student_user_id, activity_type, details, credits_awarded, event_date)
SELECT u.tenant_id, u.user_id, 'NSS', 'Annual NSS Camp — Rural Literacy Drive', 2, CURRENT_DATE - 90
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE r.role_name = 'Student'
  AND NOT EXISTS (
    SELECT 1 FROM student_extracurriculars e
    WHERE e.student_user_id = u.user_id AND e.activity_type = 'NSS'
  )
LIMIT 5;

INSERT INTO student_exit_clearances (tenant_id, student_user_id, library_cleared, finance_cleared, hostel_cleared, dept_cleared)
SELECT u.tenant_id, u.user_id, FALSE, FALSE, FALSE, FALSE
FROM users u
JOIN roles r ON r.role_id = u.role_id
WHERE r.role_name = 'Student'
ON CONFLICT (tenant_id, student_user_id) DO NOTHING;
