-- Falcon HRMS lifecycle foundation.

CREATE TABLE IF NOT EXISTS hr_job_postings (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  title VARCHAR(180) NOT NULL,
  department_id INT NULL REFERENCES departments(dept_id) ON DELETE SET NULL,
  employment_type VARCHAR(40) NOT NULL DEFAULT 'FULL_TIME',
  openings INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  description TEXT NULL,
  created_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_applicants (
  applicant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  job_id UUID NULL REFERENCES hr_job_postings(job_id) ON DELETE SET NULL,
  name VARCHAR(180) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  stage VARCHAR(40) NOT NULL DEFAULT 'APPLIED'
    CHECK (stage IN ('APPLIED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'OFFERED', 'HIRED', 'REJECTED')),
  resume_url TEXT NULL,
  notes TEXT NULL,
  hired_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_clearance_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  employee_user_id UUID NULL REFERENCES users(user_id) ON DELETE CASCADE,
  applicant_id UUID NULL REFERENCES hr_applicants(applicant_id) ON DELETE SET NULL,
  lifecycle_type VARCHAR(20) NOT NULL CHECK (lifecycle_type IN ('ONBOARDING', 'OFFBOARDING')),
  department_owner VARCHAR(40) NOT NULL,
  task_name VARCHAR(180) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
  due_date DATE NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_salary_structures (
  structure_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  structure_name VARCHAR(180) NOT NULL,
  basic NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra NUMERIC(12,2) NOT NULL DEFAULT 0,
  da NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  assigned_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_payroll_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  month VARCHAR(7) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  total_staff INT NOT NULL DEFAULT 0,
  processed_staff INT NOT NULL DEFAULT 0,
  job_id VARCHAR(120) NULL,
  started_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, month)
);

CREATE TABLE IF NOT EXISTS hr_appraisal_cycles (
  cycle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  name VARCHAR(180) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_kpi_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  cycle_id UUID NOT NULL REFERENCES hr_appraisal_cycles(cycle_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  research_papers INT NOT NULL DEFAULT 0,
  patents INT NOT NULL DEFAULT 0,
  student_feedback_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  grants_secured NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'REVIEWED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, employee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_applicants_stage ON hr_applicants (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_hr_clearance_lifecycle ON hr_clearance_tasks (tenant_id, lifecycle_type, status);
CREATE INDEX IF NOT EXISTS idx_hr_salary_user ON hr_salary_structures (tenant_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_hr_kpi_employee ON hr_kpi_submissions (tenant_id, employee_user_id);

-- Smoke data for HRMS pages.
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
hr_user AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'hr@mygyanvihar.com' LIMIT 1
),
faculty_user AS (
  SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1
),
job AS (
  INSERT INTO hr_job_postings (tenant_id, title, department_id, employment_type, openings, status, description, created_by_user_id)
  SELECT tenant.tenant_id, 'Professor of AI', dept.dept_id, 'FULL_TIME', 2, 'OPEN',
         'Faculty role for AI, ML, and applied research leadership.', hr_user.user_id
  FROM tenant, dept, hr_user
  ON CONFLICT DO NOTHING
  RETURNING job_id, tenant_id
),
job_ctx AS (
  SELECT job_id, tenant_id FROM job
  UNION ALL
  SELECT job_id, tenant_id FROM hr_job_postings WHERE title = 'Professor of AI' LIMIT 1
)
INSERT INTO hr_applicants (tenant_id, job_id, name, email, phone, stage, notes)
SELECT job_ctx.tenant_id, job_ctx.job_id, data.name, data.email, data.phone, data.stage, data.notes
FROM job_ctx
CROSS JOIN (VALUES
  ('Dr. Aditi Sharma', 'aditi.sharma@example.com', '+91-9000000011', 'APPLIED', 'Strong research profile'),
  ('Dr. Rohan Mehta', 'rohan.mehta@example.com', '+91-9000000012', 'SHORTLISTED', 'Schedule technical round'),
  ('Nisha Verma', 'nisha.verma@example.com', '+91-9000000013', 'INTERVIEW_SCHEDULED', 'Lab assistant candidate'),
  ('Aman Jain', 'aman.jain@example.com', '+91-9000000014', 'OFFERED', 'Offer letter pending signature'),
  ('Priya Nair', 'priya.nair@example.com', '+91-9000000015', 'HIRED', 'Ready for onboarding')
) AS data(name, email, phone, stage, notes)
WHERE NOT EXISTS (SELECT 1 FROM hr_applicants existing WHERE existing.email = data.email);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
faculty_user AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_salary_structures (tenant_id, structure_name, basic, hra, da, pf, tax_deduction, assigned_user_id)
SELECT tenant.tenant_id, 'Assistant Professor Grade 1', 50000, 20000, 8000, 6000, 3500, faculty_user.user_id
FROM tenant, faculty_user
WHERE NOT EXISTS (
  SELECT 1 FROM hr_salary_structures WHERE structure_name = 'Assistant Professor Grade 1'
);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
hired AS (SELECT applicant_id FROM hr_applicants WHERE stage = 'HIRED' LIMIT 1),
faculty_user AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_clearance_tasks (tenant_id, applicant_id, employee_user_id, lifecycle_type, department_owner, task_name, status, due_date)
SELECT tenant.tenant_id, hired.applicant_id, NULL, 'ONBOARDING', data.owner, data.task_name, data.status, CURRENT_DATE + 7
FROM tenant, hired
CROSS JOIN (VALUES
  ('IT', 'Create @mygyanvihar.com email', 'PENDING'),
  ('HR', 'Print employee ID card', 'IN_PROGRESS'),
  ('IT', 'Allocate workstation and laptop', 'PENDING')
) AS data(owner, task_name, status)
WHERE NOT EXISTS (
  SELECT 1 FROM hr_clearance_tasks WHERE applicant_id = hired.applicant_id AND task_name = data.task_name
)
UNION ALL
SELECT tenant.tenant_id, NULL, faculty_user.user_id, 'OFFBOARDING', data.owner, data.task_name, data.status, CURRENT_DATE + 10
FROM tenant, faculty_user
CROSS JOIN (VALUES
  ('Library', 'Confirm books returned', 'PENDING'),
  ('IT', 'Confirm laptop returned', 'PENDING'),
  ('Finance', 'Confirm dues cleared', 'PENDING')
) AS data(owner, task_name, status)
WHERE NOT EXISTS (
  SELECT 1 FROM hr_clearance_tasks WHERE employee_user_id = faculty_user.user_id AND task_name = data.task_name
);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
cycle AS (
  INSERT INTO hr_appraisal_cycles (tenant_id, name, start_date, end_date, status)
  SELECT tenant.tenant_id, 'Faculty PMS 2026', DATE '2026-01-01', DATE '2026-12-31', 'OPEN'
  FROM tenant
  WHERE NOT EXISTS (SELECT 1 FROM hr_appraisal_cycles WHERE name = 'Faculty PMS 2026')
  RETURNING cycle_id, tenant_id
),
cycle_ctx AS (
  SELECT cycle_id, tenant_id FROM cycle
  UNION ALL
  SELECT cycle_id, tenant_id FROM hr_appraisal_cycles WHERE name = 'Faculty PMS 2026' LIMIT 1
),
faculty_user AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_kpi_submissions (tenant_id, cycle_id, employee_user_id, research_papers, patents, student_feedback_score, grants_secured, status)
SELECT cycle_ctx.tenant_id, cycle_ctx.cycle_id, faculty_user.user_id, 3, 1, 4.35, 250000, 'SUBMITTED'
FROM cycle_ctx, faculty_user
ON CONFLICT (cycle_id, employee_user_id) DO UPDATE SET
  research_papers = EXCLUDED.research_papers,
  patents = EXCLUDED.patents,
  student_feedback_score = EXCLUDED.student_feedback_score,
  grants_secured = EXCLUDED.grants_secured,
  status = EXCLUDED.status;
