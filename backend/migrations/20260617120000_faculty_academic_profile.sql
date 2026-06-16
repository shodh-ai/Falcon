-- Faculty NAAC / IQAC academic profile: qualifications, research identifiers, responsibilities, bank change workflow

CREATE TABLE IF NOT EXISTS hr_academic_qualifications (
  qual_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  degree_level VARCHAR(50),
  degree_name VARCHAR(100),
  university VARCHAR(255) NOT NULL,
  passing_year INT NOT NULL,
  specialization VARCHAR(255),
  document_proof_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_academic_qualifications_user
  ON hr_academic_qualifications(tenant_id, user_id, passing_year DESC);

ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS orcid_id VARCHAR(50);
ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS scopus_id VARCHAR(50);
ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS google_scholar_url TEXT;
ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS total_experience_years DECIMAL(4,1);
ALTER TABLE hr_employee_profiles ADD COLUMN IF NOT EXISTS industry_experience_years DECIMAL(4,1) DEFAULT 0.0;

CREATE TABLE IF NOT EXISTS hr_employee_responsibilities (
  responsibility_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_responsibilities_user
  ON hr_employee_responsibilities(tenant_id, user_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS hr_profile_change_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  reviewed_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_profile_change_requests_pending
  ON hr_profile_change_requests(tenant_id, user_id, status)
  WHERE status = 'PENDING_APPROVAL';

-- Demo responsibilities for faculty personas
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
faculty AS (
  SELECT u.user_id, u.official_email, r.role_name, d.dept_name
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN departments d ON d.dept_id = u.dept_id
  WHERE lower(u.official_email) IN (
    'ellwil@mygyanvihar.com',
    'hod@mygyanvihar.com',
    'y.sachin@mygyanvihar.com'
  )
)
INSERT INTO hr_employee_responsibilities (tenant_id, user_id, title, description)
SELECT tenant.tenant_id, faculty.user_id,
       CASE
         WHEN faculty.role_name = 'HOD' THEN 'HOD of ' || COALESCE(faculty.dept_name, 'Department')
         WHEN lower(faculty.official_email) = 'ellwil@mygyanvihar.com' THEN 'Faculty Advisor (Robotics Club)'
         ELSE 'Course Coordinator'
       END,
       'Assigned responsibility for NAAC faculty profile'
FROM tenant, faculty;
