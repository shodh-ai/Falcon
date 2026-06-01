-- Falcon Campus OS gap modules: Parent, Exam Cell, Placement, Alumni, Integrations, Admin Ops.

INSERT INTO roles (role_name, description)
VALUES
  ('Parent', 'Parent portal access via registered mobile OTP'),
  ('ExamCell', 'Exam Cell workspace for seating, grade cards, and UFM cases'),
  ('CompanyHR', 'External company HR portal access for campus recruitment')
ON CONFLICT (role_name) DO NOTHING;

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS abc_id VARCHAR(20) UNIQUE;

CREATE TABLE IF NOT EXISTS parent_student_links (
  link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  parent_name VARCHAR(120) NOT NULL,
  parent_mobile VARCHAR(20) NOT NULL,
  parent_email VARCHAR(255) NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  relation VARCHAR(40) NOT NULL DEFAULT 'Guardian',
  otp_hash VARCHAR(255) NULL,
  otp_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, parent_mobile, student_user_id)
);

CREATE TABLE IF NOT EXISTS student_disciplinary_records (
  record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  action_taken TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_seating_plans (
  seating_plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE CASCADE,
  room VARCHAR(80) NOT NULL,
  seating_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grade_cards (
  grade_card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  semester INT NOT NULL,
  cgpa NUMERIC(5,2) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'WITHHELD')),
  published_at TIMESTAMPTZ NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ufm_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID REFERENCES users(user_id),
  exam_id UUID REFERENCES exam_schedules(exam_schedule_id),
  description TEXT,
  penalty_applied VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'CLOSED')),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  company_name VARCHAR(180) NOT NULL,
  hr_name VARCHAR(120) NOT NULL,
  hr_email VARCHAR(255) NOT NULL,
  hr_mobile VARCHAR(20) NULL,
  login_otp_hash VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, hr_email)
);

CREATE TABLE IF NOT EXISTS placement_job_descriptions (
  jd_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  company_id UUID NOT NULL REFERENCES placement_companies(company_id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  package_lpa NUMERIC(6,2) NULL,
  skills_required TEXT[] NOT NULL DEFAULT '{}',
  eligibility_criteria TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_resume_profiles (
  resume_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skills TEXT[] NOT NULL DEFAULT '{}',
  projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  resume_pdf_path TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS placement_mock_interviews (
  interview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  interviewer_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  score NUMERIC(5,2) NULL,
  feedback TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_shortlists (
  shortlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  jd_id UUID NOT NULL REFERENCES placement_job_descriptions(jd_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'SHORTLISTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jd_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS student_exit_clearance_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  owner_department VARCHAR(40) NOT NULL,
  task_name VARCHAR(180) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEARED', 'BLOCKED')),
  remarks TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_profiles (
  alumni_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  name VARCHAR(180) NOT NULL,
  email VARCHAR(255) NULL,
  mobile VARCHAR(20) NULL,
  linkedin_url TEXT NULL,
  current_company VARCHAR(180) NULL,
  designation VARCHAR(180) NULL,
  graduation_year INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS alumni_id UUID DEFAULT gen_random_uuid();
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS student_profile_id UUID;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS student_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS name VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS mobile VARCHAR(20);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_company VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_designation VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS designation VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS graduation_year INT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE alumni_profiles ALTER COLUMN student_profile_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS alumni_donations (
  donation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  alumni_id UUID REFERENCES alumni_profiles(alumni_id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  gateway VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY',
  gateway_reference VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'INITIATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS donation_id UUID DEFAULT gen_random_uuid();
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS alumni_profile_id UUID;
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS alumni_id UUID;
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS gateway VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY';
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS gateway_reference VARCHAR(120);
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'INITIATED';
ALTER TABLE alumni_donations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS alumni_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  title VARCHAR(180) NOT NULL,
  event_date DATE NOT NULL,
  venue VARCHAR(180) NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  integration_type VARCHAR(40) NOT NULL CHECK (integration_type IN ('DIGILOCKER', 'NAD', 'ABC', 'WHATSAPP')),
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PUSHED', 'FAILED')),
  response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS university_assets (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  asset_tag VARCHAR(80) NOT NULL,
  asset_type VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  assigned_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  assigned_room VARCHAR(80) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, asset_tag)
);

CREATE TABLE IF NOT EXISTS visitor_logs (
  visitor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  purpose TEXT,
  visiting_user_id UUID REFERENCES users(user_id),
  entry_time TIMESTAMP DEFAULT NOW(),
  exit_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  vehicle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  registration_no VARCHAR(40) NOT NULL,
  vehicle_type VARCHAR(40) NOT NULL DEFAULT 'BUS',
  driver_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  route_zone VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tenant_id, registration_no)
);

CREATE TABLE IF NOT EXISTS fleet_fuel_logs (
  fuel_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(vehicle_id) ON DELETE CASCADE,
  fuel_date DATE NOT NULL DEFAULT CURRENT_DATE,
  litres NUMERIC(8,2) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  odometer_reading INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Smoke data
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1),
pwd AS (SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash),
exam_cell_role AS (SELECT role_id FROM roles WHERE role_name = 'ExamCell' LIMIT 1)
INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active)
SELECT tenant.tenant_id, 'Exam Cell Officer', 'examcell@mygyanvihar.com', exam_cell_role.role_id, pwd.hash, true
FROM tenant, exam_cell_role, pwd
ON CONFLICT (tenant_id, official_email) DO UPDATE SET role_id = EXCLUDED.role_id, password_hash = EXCLUDED.password_hash, is_active = true;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
pwd AS (SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash),
parent_role AS (SELECT role_id FROM roles WHERE role_name = 'Parent' LIMIT 1)
INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active)
SELECT tenant.tenant_id, 'Sachin Parent', 'parent1@example.com', parent_role.role_id, pwd.hash, true
FROM tenant, parent_role, pwd
ON CONFLICT (tenant_id, official_email) DO UPDATE SET role_id = EXCLUDED.role_id, password_hash = EXCLUDED.password_hash, is_active = true;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'y.sachin@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO parent_student_links (tenant_id, parent_name, parent_mobile, parent_email, student_user_id, relation)
SELECT tenant.tenant_id, 'Sachin Parent', '+919999000001', 'parent1@example.com', student.user_id, 'Father'
FROM tenant, student
ON CONFLICT (tenant_id, parent_mobile, student_user_id) DO UPDATE SET parent_name = EXCLUDED.parent_name, parent_email = EXCLUDED.parent_email;

WITH student AS (SELECT user_id FROM users WHERE lower(official_email) = 'y.sachin@mygyanvihar.com' LIMIT 1)
DELETE FROM parent_student_links
WHERE parent_mobile = '+919999000001'
  AND student_user_id <> (SELECT user_id FROM student);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1)
UPDATE student_profiles
SET abc_id = COALESCE(abc_id, '123456789012')
WHERE user_id = (SELECT user_id FROM student);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO student_disciplinary_records (tenant_id, student_user_id, category, description, action_taken)
SELECT tenant.tenant_id, student.user_id, 'Attendance Warning', 'Absent from two consecutive lab sessions.', 'Mentor informed parent'
FROM tenant, student
WHERE NOT EXISTS (SELECT 1 FROM student_disciplinary_records WHERE student_user_id = student.user_id);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1),
exam AS (SELECT exam_schedule_id FROM exam_schedules LIMIT 1)
INSERT INTO ufm_cases (tenant_id, student_user_id, exam_id, description, penalty_applied, status)
SELECT tenant.tenant_id, student.user_id, exam.exam_schedule_id, 'Mobile phone found near desk during mid-term exam.', 'Paper cancelled pending committee review', 'OPEN'
FROM tenant, student, exam
WHERE NOT EXISTS (SELECT 1 FROM ufm_cases WHERE student_user_id = student.user_id);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
company AS (
  INSERT INTO placement_companies (tenant_id, company_name, hr_name, hr_email, hr_mobile)
  SELECT tenant.tenant_id, 'Falcon Labs', 'Corporate HR', 'hr@falconlabs.example', '+919999000010'
  FROM tenant
  ON CONFLICT (tenant_id, hr_email) DO UPDATE SET company_name = EXCLUDED.company_name
  RETURNING company_id, tenant_id
)
INSERT INTO placement_job_descriptions (tenant_id, company_id, title, package_lpa, skills_required, eligibility_criteria, status)
SELECT company.tenant_id, company.company_id, 'Software Engineer Trainee', 6.50, ARRAY['Java', 'SQL', 'React'], 'CGPA 7.0+', 'OPEN'
FROM company
WHERE NOT EXISTS (SELECT 1 FROM placement_job_descriptions WHERE title = 'Software Engineer Trainee');

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO student_resume_profiles (tenant_id, student_user_id, skills, projects)
SELECT tenant.tenant_id, student.user_id, ARRAY['React', 'PostgreSQL', 'Machine Learning'],
       '[{"title":"Campus OS Dashboard","summary":"Built analytics UI for academic workflows"}]'::jsonb
FROM tenant, student
ON CONFLICT (tenant_id, student_user_id) DO UPDATE SET skills = EXCLUDED.skills, projects = EXCLUDED.projects;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO placement_mock_interviews (tenant_id, student_user_id, interviewer_user_id, scheduled_at, score, feedback, status)
SELECT tenant.tenant_id, student.user_id, faculty.user_id, NOW() + INTERVAL '3 days', 8.2, 'Strong fundamentals; improve system design examples.', 'COMPLETED'
FROM tenant, student, faculty
WHERE NOT EXISTS (SELECT 1 FROM placement_mock_interviews WHERE student_user_id = student.user_id);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1)
INSERT INTO student_exit_clearance_tasks (tenant_id, student_user_id, owner_department, task_name, status)
SELECT tenant.tenant_id, student.user_id, data.owner, data.task_name, 'PENDING'
FROM tenant, student
CROSS JOIN (VALUES
  ('Library', 'Books returned'),
  ('Hostel', 'Room vacated'),
  ('Accounts', 'Fees paid')
) AS data(owner, task_name)
WHERE NOT EXISTS (SELECT 1 FROM student_exit_clearance_tasks WHERE student_user_id = student.user_id AND task_name = data.task_name);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
student AS (SELECT user_id FROM users WHERE lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1)
INSERT INTO alumni_profiles (tenant_id, student_user_id, name, email, linkedin_url, current_company, designation, graduation_year)
SELECT tenant.tenant_id, student.user_id, 'Student One Alumni', 'student1.alumni@example.com', 'https://linkedin.com/in/student-one', 'Falcon Labs', 'Software Engineer', 2026
FROM tenant, student
WHERE NOT EXISTS (SELECT 1 FROM alumni_profiles WHERE student_user_id = student.user_id);

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO university_assets (tenant_id, asset_tag, asset_type, name, assigned_user_id, assigned_room, status)
SELECT tenant.tenant_id, 'LAP-SGVU-001', 'Laptop', 'Dell Latitude Faculty Laptop', faculty.user_id, 'CSE-204', 'ASSIGNED'
FROM tenant, faculty
ON CONFLICT (tenant_id, asset_tag) DO NOTHING;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO visitor_logs (tenant_id, name, phone, purpose, visiting_user_id)
SELECT tenant.tenant_id, 'Campus Visitor', '+919999000099', 'Meeting faculty for admissions query', faculty.user_id
FROM tenant, faculty
WHERE NOT EXISTS (SELECT 1 FROM visitor_logs WHERE phone = '+919999000099');

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO fleet_vehicles (tenant_id, registration_no, vehicle_type, route_zone, status)
SELECT tenant.tenant_id, 'RJ14-SGVU-1001', 'BUS', 'Jagatpura Zone', 'ACTIVE'
FROM tenant
ON CONFLICT (tenant_id, registration_no) DO NOTHING;
