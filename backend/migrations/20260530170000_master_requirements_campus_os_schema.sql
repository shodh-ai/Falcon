-- Falcon Campus OS master requirements database expansion.
-- Database-first migration for the University's Master Requirements PDF.
-- Scope: schema only; UI/API implementation follows in later phases.

-- ---------------------------------------------------------------------------
-- 10. User Roles & Permissions
-- ---------------------------------------------------------------------------
INSERT INTO roles (role_name, description)
VALUES
  ('Chancellor', 'University-level executive visibility and approvals'),
  ('Registrar', 'Registrar office administration and academic records control'),
  ('Dean', 'Dean-level academic and administrative approvals'),
  ('HoD', 'Head of Department approvals and departmental oversight'),
  ('Faculty', 'Faculty teaching, mentoring, and academic operations'),
  ('Exam Cell', 'Examination cell marks, seating, UFM, and result operations'),
  ('Accounts', 'Finance, accounts, fee, GST, and TDS operations'),
  ('HR', 'Human resources and employee lifecycle operations'),
  ('Student', 'Student self-service portal access'),
  ('Parent', 'Parent portal access'),
  ('Alumni', 'Alumni portal access'),
  ('Placement Officer', 'Training and placement office operations'),
  ('IQAC Coordinator', 'IQAC, NAAC, NIRF, and accreditation operations')
ON CONFLICT (role_name) DO UPDATE SET
  description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS role_permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  module_key VARCHAR(80) NOT NULL,
  resource_key VARCHAR(120) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  scope VARCHAR(30) NOT NULL DEFAULT 'TENANT'
    CHECK (scope IN ('SELF', 'DEPARTMENT', 'TENANT', 'UNIVERSITY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role_id, module_key, resource_key)
);

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id) ON DELETE CASCADE;
UPDATE role_permissions
SET tenant_id = 'a0000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;
ALTER TABLE role_permissions ALTER COLUMN tenant_id SET DEFAULT 'a0000000-0000-4000-8000-000000000001';

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS module_key VARCHAR(80);
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS resource_key VARCHAR(120);
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_view BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_edit BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'TENANT';
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions'
  ) THEN
    UPDATE role_permissions rp
    SET
      module_key = COALESCE(rp.module_key, split_part(p.permission_key, '_', 3), 'legacy'),
      resource_key = COALESCE(rp.resource_key, p.permission_key)
    FROM permissions p
    WHERE rp.permission_id::text = p.permission_id::text
      AND (rp.module_key IS NULL OR rp.resource_key IS NULL);
  END IF;
END $$;

UPDATE role_permissions
SET
  module_key = COALESCE(module_key, 'legacy'),
  resource_key = COALESCE(resource_key, 'legacy_permission_' || permission_id::text)
WHERE module_key IS NULL OR resource_key IS NULL;

ALTER TABLE role_permissions
  DROP CONSTRAINT IF EXISTS chk_role_permissions_scope;
ALTER TABLE role_permissions
  ADD CONSTRAINT chk_role_permissions_scope CHECK (scope IN ('SELF', 'DEPARTMENT', 'TENANT', 'UNIVERSITY'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_matrix_unique
  ON role_permissions(tenant_id, role_id, module_key, resource_key);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON role_permissions(tenant_id, role_id);

-- ---------------------------------------------------------------------------
-- 1. Student Lifecycle Management (Entry to Exit)
-- ---------------------------------------------------------------------------
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
UPDATE student_profiles sp
SET tenant_id = u.tenant_id
FROM users u
WHERE sp.user_id = u.user_id
  AND sp.tenant_id IS NULL;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS aadhaar_encrypted TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS passport_encrypted TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS category VARCHAR(40);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(30);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS nationality VARCHAR(80) DEFAULT 'Indian';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_type VARCHAR(30)
  CHECK (admission_type IS NULL OR admission_type IN ('REGULAR', 'LATERAL'));
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_number VARCHAR(80);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS admission_status VARCHAR(30) DEFAULT 'ACTIVE'
  CHECK (admission_status IN ('APPLIED', 'PROVISIONAL', 'ACTIVE', 'WITHDRAWN', 'GRADUATED', 'CANCELLED'));
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS migration_certificate_status VARCHAR(30) DEFAULT 'PENDING'
  CHECK (migration_certificate_status IN ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'REJECTED'));
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS final_result VARCHAR(30)
  CHECK (final_result IS NULL OR final_result IN ('PASS', 'FAIL', 'WITHHELD', 'IN_PROGRESS'));
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS no_dues_status VARCHAR(30) DEFAULT 'NOT_STARTED'
  CHECK (no_dues_status IN ('NOT_STARTED', 'IN_PROGRESS', 'CLEARED', 'BLOCKED'));
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS alumni_conversion_flag BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS degree_issued_at TIMESTAMPTZ;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS degree_award_status VARCHAR(30) DEFAULT 'NOT_ELIGIBLE'
  CHECK (degree_award_status IN ('NOT_ELIGIBLE', 'ELIGIBLE', 'AWARDED', 'WITHHELD'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profiles_tenant_admission_number
  ON student_profiles(tenant_id, admission_number)
  WHERE admission_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS student_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  application_no VARCHAR(80) NOT NULL,
  applicant_name VARCHAR(180) NOT NULL,
  program_applied VARCHAR(180) NOT NULL,
  admission_type VARCHAR(30) NOT NULL DEFAULT 'REGULAR'
    CHECK (admission_type IN ('REGULAR', 'LATERAL')),
  category VARCHAR(40),
  gender VARCHAR(30),
  date_of_birth DATE,
  nationality VARCHAR(80) DEFAULT 'Indian',
  aadhaar_encrypted TEXT,
  passport_encrypted TEXT,
  application_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SELECTED', 'WAITLISTED', 'REJECTED', 'ADMITTED')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, application_no)
);

CREATE TABLE IF NOT EXISTS entrance_exam_details (
  entrance_exam_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES student_applications(application_id) ON DELETE CASCADE,
  exam_name VARCHAR(120) NOT NULL,
  roll_number VARCHAR(80),
  exam_date DATE,
  score NUMERIC(8,2),
  percentile NUMERIC(6,3),
  rank_obtained INT,
  result_status VARCHAR(30) DEFAULT 'PENDING'
    CHECK (result_status IN ('PENDING', 'QUALIFIED', 'NOT_QUALIFIED', 'ABSENT')),
  scorecard_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS counseling_details (
  counseling_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES student_applications(application_id) ON DELETE CASCADE,
  round_no INT NOT NULL DEFAULT 1,
  counseling_date DATE,
  allotted_program VARCHAR(180),
  allotted_department_id INT NULL REFERENCES departments(dept_id) ON DELETE SET NULL,
  seat_category VARCHAR(60),
  decision VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (decision IN ('PENDING', 'ACCEPTED', 'DECLINED', 'UPGRADED', 'CANCELLED')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_document_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  application_id UUID NULL REFERENCES student_applications(application_id) ON DELETE CASCADE,
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  document_number VARCHAR(120),
  document_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'WAIVED')),
  verified_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS previous_qualification_records (
  qualification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  application_id UUID NULL REFERENCES student_applications(application_id) ON DELETE CASCADE,
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE CASCADE,
  qualification_level VARCHAR(80) NOT NULL,
  institution_name VARCHAR(180) NOT NULL,
  board_or_university VARCHAR(180),
  passing_year INT,
  percentage NUMERIC(5,2),
  cgpa NUMERIC(5,2),
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_records (
  academic_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  semester INT NOT NULL,
  internal_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
  mid_term_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
  end_semester_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
  credits_registered NUMERIC(6,2) NOT NULL DEFAULT 0,
  credits_earned NUMERIC(6,2) NOT NULL DEFAULT 0,
  sgpa NUMERIC(5,2),
  cgpa NUMERIC(5,2),
  backlog_count INT NOT NULL DEFAULT 0,
  progression_status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (progression_status IN ('IN_PROGRESS', 'PROMOTED', 'DETAINED', 'PASSED', 'FAILED', 'WITHHELD')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, academic_year, semester)
);

CREATE TABLE IF NOT EXISTS student_course_assessments (
  assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NULL REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  academic_year VARCHAR(12) NOT NULL,
  semester INT NOT NULL,
  internal_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
  mid_term_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
  end_semester_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_marks NUMERIC(7,2) NOT NULL DEFAULT 0,
  grade VARCHAR(10),
  grade_points NUMERIC(5,2),
  credits_earned NUMERIC(5,2) NOT NULL DEFAULT 0,
  result_status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (result_status IN ('IN_PROGRESS', 'PASS', 'FAIL', 'BACKLOG', 'WITHHELD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, course_id, academic_year, semester)
);

CREATE TABLE IF NOT EXISTS student_backlog_history (
  backlog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NULL REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  subject_id INT NULL,
  academic_year VARCHAR(12) NOT NULL,
  semester INT NOT NULL,
  attempt_no INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'CLEARED', 'FAILED_AGAIN', 'WAIVED')),
  cleared_exam_schedule_id UUID NULL REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS exam_revaluation_requests (
  revaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  exam_schedule_id UUID NULL REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  course_id UUID NULL REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  original_marks NUMERIC(6,2),
  revised_marks NUMERIC(6,2),
  fee_transaction_id UUID NULL REFERENCES finance_transactions(transaction_id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('APPLIED', 'FEE_PENDING', 'UNDER_REVIEW', 'UPDATED', 'REJECTED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS degree_awards (
  degree_award_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  program_name VARCHAR(180) NOT NULL,
  final_result VARCHAR(30) NOT NULL
    CHECK (final_result IN ('PASS', 'FAIL', 'WITHHELD')),
  final_cgpa NUMERIC(5,2),
  award_date DATE,
  degree_number VARCHAR(120),
  nad_reference VARCHAR(120),
  issued_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'ISSUED', 'WITHHELD')),
  UNIQUE (tenant_id, degree_number)
);

CREATE TABLE IF NOT EXISTS ncc_nss_sodeca_records (
  participation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  program_type VARCHAR(20) NOT NULL CHECK (program_type IN ('NCC', 'NSS', 'SODECA')),
  activity_name VARCHAR(180) NOT NULL,
  academic_year VARCHAR(12) NOT NULL,
  start_date DATE,
  end_date DATE,
  hours_completed NUMERIC(7,2) NOT NULL DEFAULT 0,
  credits_awarded NUMERIC(5,2) NOT NULL DEFAULT 0,
  certificate_url TEXT,
  approved_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RECORDED'
    CHECK (status IN ('RECORDED', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_grievance_tickets (
  grievance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category VARCHAR(80) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED')),
  assigned_to_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE student_exit_clearance_tasks ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE student_exit_clearance_tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE student_exit_clearance_tasks ADD COLUMN IF NOT EXISTS due_date DATE;

-- ---------------------------------------------------------------------------
-- 2. Placement & Training Module
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_master (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  company_name VARCHAR(180) NOT NULL,
  industry VARCHAR(120),
  website_url TEXT,
  headquarters VARCHAR(180),
  gstin VARCHAR(30),
  relationship_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (relationship_status IN ('PROSPECT', 'ACTIVE', 'INACTIVE', 'BLACKLISTED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, company_name)
);

ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS company_master_id UUID REFERENCES company_master(company_id) ON DELETE SET NULL;
ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS designation VARCHAR(120);
ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS is_primary_contact BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS hr_contact_database (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES company_master(company_id) ON DELETE CASCADE,
  contact_name VARCHAR(140) NOT NULL,
  designation VARCHAR(120),
  email VARCHAR(255) NOT NULL,
  mobile VARCHAR(30),
  linkedin_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, company_id, email)
);

ALTER TABLE placement_job_descriptions ADD COLUMN IF NOT EXISTS min_cgpa NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE placement_job_descriptions ADD COLUMN IF NOT EXISTS max_active_backlogs INT NOT NULL DEFAULT 999;
ALTER TABLE placement_job_descriptions ADD COLUMN IF NOT EXISTS eligible_departments INT[] NOT NULL DEFAULT '{}';
ALTER TABLE placement_job_descriptions ADD COLUMN IF NOT EXISTS job_profile TEXT;
ALTER TABLE placement_job_descriptions ADD COLUMN IF NOT EXISTS application_deadline TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS placement_drive_records (
  drive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES company_master(company_id) ON DELETE CASCADE,
  jd_id UUID NULL REFERENCES placement_job_descriptions(jd_id) ON DELETE SET NULL,
  drive_name VARCHAR(180) NOT NULL,
  drive_date DATE NOT NULL,
  mode VARCHAR(30) NOT NULL DEFAULT 'ON_CAMPUS'
    CHECK (mode IN ('ON_CAMPUS', 'OFF_CAMPUS', 'VIRTUAL')),
  venue VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('PLANNED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  jd_id UUID NOT NULL REFERENCES placement_job_descriptions(jd_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  cgpa_at_apply NUMERIC(5,2),
  active_backlogs_at_apply INT NOT NULL DEFAULT 0,
  eligibility_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (eligibility_status IN ('PENDING', 'ELIGIBLE', 'BLOCKED_CGPA', 'BLOCKED_BACKLOG', 'BLOCKED_DEPARTMENT')),
  status VARCHAR(30) NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED', 'WITHDRAWN')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jd_id, student_user_id)
);

ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS application_id UUID DEFAULT gen_random_uuid();
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id) ON DELETE CASCADE;
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS jd_id UUID REFERENCES placement_job_descriptions(jd_id) ON DELETE CASCADE;
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS student_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS cgpa_at_apply NUMERIC(5,2);
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS active_backlogs_at_apply INT NOT NULL DEFAULT 0;
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS eligibility_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
  CHECK (eligibility_status IN ('PENDING', 'ELIGIBLE', 'BLOCKED_CGPA', 'BLOCKED_BACKLOG', 'BLOCKED_DEPARTMENT'));
ALTER TABLE placement_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE placement_applications
SET tenant_id = 'a0000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;
UPDATE placement_applications
SET application_id = gen_random_uuid()
WHERE application_id IS NULL;

CREATE TABLE IF NOT EXISTS student_skill_mappings (
  skill_mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_name VARCHAR(120) NOT NULL,
  proficiency VARCHAR(30) NOT NULL DEFAULT 'BEGINNER'
    CHECK (proficiency IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')),
  verified_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, skill_name)
);

CREATE TABLE IF NOT EXISTS student_internships (
  internship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES company_master(company_id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  start_date DATE,
  end_date DATE,
  stipend NUMERIC(12,2),
  certificate_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ONGOING'
    CHECK (status IN ('OFFERED', 'ONGOING', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_calendar (
  training_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  trainer_name VARCHAR(140),
  topic VARCHAR(180),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  target_departments INT[] NOT NULL DEFAULT '{}',
  capacity INT,
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS native_resume_builder_sections (
  section_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES student_resume_profiles(resume_id) ON DELETE CASCADE,
  section_type VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_offer_letters (
  offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES company_master(company_id) ON DELETE CASCADE,
  jd_id UUID NULL REFERENCES placement_job_descriptions(jd_id) ON DELETE SET NULL,
  offer_letter_url TEXT NOT NULL,
  package_lpa NUMERIC(6,2),
  joining_date DATE,
  joining_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (joining_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'JOINED', 'DEFERRED')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Alumni Management
-- ---------------------------------------------------------------------------
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS batch_year INT;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS program_name VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS current_organization VARCHAR(180);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
  CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
UPDATE alumni_profiles
SET alumni_id = gen_random_uuid()
WHERE alumni_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alumni_profiles_alumni_id_unique
  ON alumni_profiles(alumni_id);

CREATE TABLE IF NOT EXISTS alumni_higher_education_records (
  higher_education_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  alumni_id UUID NOT NULL REFERENCES alumni_profiles(alumni_id) ON DELETE CASCADE,
  institution_name VARCHAR(180) NOT NULL,
  program_name VARCHAR(180) NOT NULL,
  country VARCHAR(80),
  start_year INT,
  completion_year INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_forum_threads (
  thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  alumni_id UUID NULL REFERENCES alumni_profiles(alumni_id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  visibility VARCHAR(30) NOT NULL DEFAULT 'ALUMNI'
    CHECK (visibility IN ('ALUMNI', 'STUDENTS', 'PUBLIC')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_forum_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES alumni_forum_threads(thread_id) ON DELETE CASCADE,
  alumni_id UUID NULL REFERENCES alumni_profiles(alumni_id) ON DELETE SET NULL,
  user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_event_registrations (
  registration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES alumni_events(event_id) ON DELETE CASCADE,
  alumni_id UUID NOT NULL REFERENCES alumni_profiles(alumni_id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED'
    CHECK (status IN ('REGISTERED', 'ATTENDED', 'CANCELLED')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, alumni_id)
);

CREATE TABLE IF NOT EXISTS alumni_mentorship_activities (
  mentorship_activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  alumni_id UUID NOT NULL REFERENCES alumni_profiles(alumni_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  topic VARCHAR(180) NOT NULL,
  scheduled_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE alumni_donations
SET donation_id = gen_random_uuid()
WHERE donation_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alumni_donations_donation_id_unique
  ON alumni_donations(donation_id);

CREATE TABLE IF NOT EXISTS alumni_contribution_tracking (
  contribution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  alumni_id UUID NULL REFERENCES alumni_profiles(alumni_id) ON DELETE SET NULL,
  donation_id UUID NULL,
  contribution_type VARCHAR(40) NOT NULL DEFAULT 'DONATION'
    CHECK (contribution_type IN ('DONATION', 'SPONSORSHIP', 'EQUIPMENT', 'MENTORING', 'OTHER')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  purpose VARCHAR(180),
  receipt_url TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_alumni_contribution_donation'
  ) THEN
    ALTER TABLE alumni_contribution_tracking
      ADD CONSTRAINT fk_alumni_contribution_donation
      FOREIGN KEY (donation_id) REFERENCES alumni_donations(donation_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. IQAC & Accreditation Module
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faculty_publications (
  publication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  journal_or_conference VARCHAR(255),
  publication_type VARCHAR(40) NOT NULL DEFAULT 'JOURNAL'
    CHECK (publication_type IN ('JOURNAL', 'CONFERENCE', 'BOOK', 'BOOK_CHAPTER', 'OTHER')),
  indexed_in VARCHAR(120),
  doi VARCHAR(120),
  publication_date DATE,
  proof_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_patents (
  patent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  patent_number VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'FILED'
    CHECK (status IN ('FILED', 'PUBLISHED', 'GRANTED', 'EXPIRED')),
  filed_date DATE,
  granted_date DATE,
  proof_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_fdp_sttp_records (
  fdp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  program_name VARCHAR(220) NOT NULL,
  organizer VARCHAR(180),
  program_type VARCHAR(20) NOT NULL CHECK (program_type IN ('FDP', 'STTP', 'WORKSHOP', 'TRAINING')),
  start_date DATE,
  end_date DATE,
  hours NUMERIC(6,2) DEFAULT 0,
  certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_consultancy_work (
  consultancy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  client_name VARCHAR(180) NOT NULL,
  project_title VARCHAR(220) NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  proof_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_research_projects (
  research_project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  principal_investigator_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  funding_agency VARCHAR(180),
  grant_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'ONGOING'
    CHECK (status IN ('PROPOSED', 'ONGOING', 'COMPLETED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_feedback_records (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NULL REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  academic_year VARCHAR(12) NOT NULL,
  semester INT NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  feedback_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_audit_reports (
  audit_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  department_id INT NULL REFERENCES departments(dept_id) ON DELETE SET NULL,
  academic_year VARCHAR(12) NOT NULL,
  audit_type VARCHAR(60) NOT NULL,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_document_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED')),
  prepared_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  approved_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accreditation_reports (
  accreditation_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  report_type VARCHAR(40) NOT NULL CHECK (report_type IN ('NAAC', 'NIRF', 'AQAR', 'SSR', 'AICTE')),
  cycle_year VARCHAR(12) NOT NULL,
  criteria_key VARCHAR(40),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'GENERATED', 'SUBMITTED', 'APPROVED')),
  generated_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS criteria_document_repository (
  criteria_document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  criteria_key VARCHAR(40) NOT NULL,
  document_title VARCHAR(220) NOT NULL,
  document_url TEXT NOT NULL,
  report_type VARCHAR(40) NOT NULL DEFAULT 'NAAC',
  uploaded_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS naac_ssr_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  metric_code VARCHAR(40) NOT NULL,
  metric_name VARCHAR(255) NOT NULL,
  academic_year VARCHAR(12) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_document_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'VERIFIED', 'SUBMITTED')),
  UNIQUE (tenant_id, metric_code, academic_year)
);

CREATE TABLE IF NOT EXISTS kpi_dashboard_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  dashboard_key VARCHAR(80) NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, dashboard_key, snapshot_date)
);

CREATE TABLE IF NOT EXISTS ranking_analytics (
  ranking_analytics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  ranking_type VARCHAR(40) NOT NULL CHECK (ranking_type IN ('NIRF', 'NAAC', 'QS', 'THE', 'OTHER')),
  cycle_year VARCHAR(12) NOT NULL,
  simulated_score NUMERIC(8,3),
  rank_band VARCHAR(80),
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. HRMS Module
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_details_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pan_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_encrypted TEXT;

CREATE TABLE IF NOT EXISTS hr_employee_master_data (
  employee_master_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  employee_code VARCHAR(80) NOT NULL,
  joining_date DATE,
  employment_type VARCHAR(40) NOT NULL DEFAULT 'FULL_TIME',
  bank_details_encrypted TEXT,
  pan_encrypted TEXT,
  aadhaar_encrypted TEXT,
  compliance_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (compliance_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_code),
  UNIQUE (tenant_id, employee_user_id)
);

CREATE TABLE IF NOT EXISTS hr_promotion_history (
  promotion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  from_designation VARCHAR(140),
  to_designation VARCHAR(140) NOT NULL,
  effective_date DATE NOT NULL,
  api_score NUMERIC(8,2),
  approved_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  order_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_api_score_calculations (
  api_score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  academic_year VARCHAR(12) NOT NULL,
  teaching_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  research_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  service_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  calculation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED')),
  UNIQUE (tenant_id, employee_user_id, academic_year)
);

CREATE TABLE IF NOT EXISTS hr_research_output_tracking (
  research_output_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  output_type VARCHAR(40) NOT NULL,
  linked_record_id UUID,
  title VARCHAR(255) NOT NULL,
  points NUMERIC(8,2) NOT NULL DEFAULT 0,
  academic_year VARCHAR(12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biometric_attendance_events (
  biometric_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  device_id VARCHAR(120) NOT NULL,
  employee_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  external_employee_code VARCHAR(80),
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type VARCHAR(20) NOT NULL DEFAULT 'IN'
    CHECK (punch_type IN ('IN', 'OUT', 'BREAK_IN', 'BREAK_OUT')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_leave_balance_management (
  leave_balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  leave_type VARCHAR(40) NOT NULL,
  opening_balance NUMERIC(6,2) NOT NULL DEFAULT 0,
  accrued NUMERIC(6,2) NOT NULL DEFAULT 0,
  consumed NUMERIC(6,2) NOT NULL DEFAULT 0,
  available NUMERIC(6,2) NOT NULL DEFAULT 0,
  academic_year VARCHAR(12) NOT NULL,
  UNIQUE (tenant_id, employee_user_id, leave_type, academic_year)
);

CREATE TABLE IF NOT EXISTS hr_promotion_workflows (
  promotion_workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  current_stage VARCHAR(60) NOT NULL DEFAULT 'HOD_REVIEW',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED')),
  workflow_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 6. Finance & Accounts Module
-- ---------------------------------------------------------------------------
ALTER TABLE finance_fee_demands ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
UPDATE finance_fee_demands f
SET tenant_id = u.tenant_id
FROM users u
WHERE f.student_user_id = u.user_id
  AND f.tenant_id IS NULL;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(tenant_id);
UPDATE finance_transactions t
SET tenant_id = u.tenant_id
FROM users u
WHERE t.student_user_id = u.user_id
  AND t.tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS finance_ledger_accounts (
  ledger_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  account_code VARCHAR(40) NOT NULL,
  account_name VARCHAR(180) NOT NULL,
  account_type VARCHAR(40) NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY')),
  parent_ledger_account_id UUID NULL REFERENCES finance_ledger_accounts(ledger_account_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, account_code)
);

CREATE TABLE IF NOT EXISTS finance_expense_heads (
  expense_head_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  head_code VARCHAR(40) NOT NULL,
  head_name VARCHAR(180) NOT NULL,
  ledger_account_id UUID NULL REFERENCES finance_ledger_accounts(ledger_account_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, head_code)
);

CREATE TABLE IF NOT EXISTS vendor_database (
  vendor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  vendor_name VARCHAR(180) NOT NULL,
  gstin VARCHAR(30),
  pan_encrypted TEXT,
  contact_name VARCHAR(140),
  contact_email VARCHAR(255),
  contact_mobile VARCHAR(30),
  bank_details_encrypted TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLACKLISTED')),
  UNIQUE (tenant_id, vendor_name)
);

CREATE TABLE IF NOT EXISTS finance_budget_allocations (
  budget_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  department_id INT NULL REFERENCES departments(dept_id) ON DELETE SET NULL,
  expense_head_id UUID NOT NULL REFERENCES finance_expense_heads(expense_head_id) ON DELETE CASCADE,
  financial_year VARCHAR(12) NOT NULL,
  allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  consumed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'LOCKED', 'CLOSED')),
  UNIQUE (tenant_id, department_id, expense_head_id, financial_year)
);

CREATE TABLE IF NOT EXISTS finance_gst_tds_tracking (
  tax_tracking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('VENDOR', 'PAYROLL', 'FEE', 'OTHER')),
  source_id UUID,
  vendor_id UUID NULL REFERENCES vendor_database(vendor_id) ON DELETE SET NULL,
  employee_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_period VARCHAR(7) NOT NULL,
  filing_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (filing_status IN ('PENDING', 'FILED', 'RECONCILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_vendor_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendor_database(vendor_id) ON DELETE RESTRICT,
  invoice_number VARCHAR(120) NOT NULL,
  invoice_date DATE NOT NULL,
  expense_head_id UUID NULL REFERENCES finance_expense_heads(expense_head_id) ON DELETE SET NULL,
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'REJECTED')),
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS finance_auto_receipts (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  transaction_id UUID NULL REFERENCES finance_transactions(transaction_id) ON DELETE SET NULL,
  demand_id UUID NULL REFERENCES finance_fee_demands(demand_id) ON DELETE SET NULL,
  receipt_number VARCHAR(120) NOT NULL,
  receipt_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS finance_audit_reports (
  audit_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  financial_year VARCHAR(12) NOT NULL,
  report_type VARCHAR(80) NOT NULL,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_document_id UUID,
  generated_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 7. Administration Module
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campus_spaces (
  space_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  building_name VARCHAR(120) NOT NULL,
  room_number VARCHAR(80) NOT NULL,
  space_type VARCHAR(40) NOT NULL CHECK (space_type IN ('CLASSROOM', 'LAB', 'AUDITORIUM', 'OFFICE', 'HOSTEL', 'SPORTS', 'OTHER')),
  capacity INT,
  facilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'MAINTENANCE', 'BLOCKED')),
  UNIQUE (tenant_id, building_name, room_number)
);

CREATE TABLE IF NOT EXISTS timetable_room_allocations (
  room_allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES campus_spaces(space_id) ON DELETE CASCADE,
  course_id UUID NULL REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  faculty_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  allocation_date DATE,
  day_of_week INT CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  purpose VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  inventory_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  item_code VARCHAR(80) NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  location VARCHAR(120),
  UNIQUE (tenant_id, item_code)
);

ALTER TABLE university_assets ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(inventory_item_id) ON DELETE SET NULL;
ALTER TABLE university_assets ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE university_assets ADD COLUMN IF NOT EXISTS warranty_till DATE;
ALTER TABLE university_assets ADD COLUMN IF NOT EXISTS asset_value NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS asset_maintenance_records (
  maintenance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES university_assets(asset_id) ON DELETE CASCADE,
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  issue_description TEXT,
  vendor_id UUID NULL REFERENCES vendor_database(vendor_id) ON DELETE SET NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fleet_routes (
  route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  route_code VARCHAR(40) NOT NULL,
  route_name VARCHAR(180) NOT NULL,
  stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  distance_km NUMERIC(8,2),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tenant_id, route_code)
);

ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES fleet_routes(route_id) ON DELETE SET NULL;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS gate_no VARCHAR(40);
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS id_proof_type VARCHAR(60);
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS id_proof_number_encrypted TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS campus_event_management (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  event_name VARCHAR(180) NOT NULL,
  event_type VARCHAR(80),
  organizer_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  space_id UUID NULL REFERENCES campus_spaces(space_id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'APPROVED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8. Essential Integrations
-- ---------------------------------------------------------------------------
ALTER TABLE integration_jobs DROP CONSTRAINT IF EXISTS integration_jobs_integration_type_check;
ALTER TABLE integration_jobs ADD CONSTRAINT integration_jobs_integration_type_check
  CHECK (integration_type IN ('DIGILOCKER', 'NAD', 'ABC', 'WHATSAPP', 'BIOMETRIC', 'SMS', 'EMAIL', 'MOODLE', 'LIBRARY', 'EXAM_SOFTWARE', 'ERP', 'GEMINI', 'POWERBI', 'TABLEAU'));

CREATE TABLE IF NOT EXISTS integration_connectors (
  connector_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  connector_type VARCHAR(40) NOT NULL,
  display_name VARCHAR(140) NOT NULL,
  base_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'SANDBOX_PENDING'
    CHECK (status IN ('SANDBOX_PENDING', 'CONFIGURED', 'ACTIVE', 'DISABLED', 'ERROR')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, connector_type, display_name)
);

CREATE TABLE IF NOT EXISTS integration_api_credentials (
  credential_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES integration_connectors(connector_id) ON DELETE CASCADE,
  credential_name VARCHAR(120) NOT NULL,
  encrypted_payload TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'ROTATED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso_bridges (
  sso_bridge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL CHECK (provider IN ('MOODLE', 'LMS', 'LIBRARY', 'EXAM_SOFTWARE')),
  oauth_client_id VARCHAR(180),
  oauth_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  launch_url TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIGURED'
    CHECK (status IN ('CONFIGURED', 'ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS integration_webhook_events (
  webhook_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  connector_id UUID NULL REFERENCES integration_connectors(connector_id) ON DELETE SET NULL,
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'FAILED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chatbot_knowledge_sources (
  knowledge_source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL CHECK (source_type IN ('RULEBOOK', 'POLICY', 'FAQ', 'DOCUMENT')),
  title VARCHAR(220) NOT NULL,
  document_id UUID,
  gemini_training_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (gemini_training_status IN ('PENDING', 'INDEXING', 'READY', 'FAILED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_warehouse_export_jobs (
  export_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  destination VARCHAR(40) NOT NULL CHECK (destination IN ('POWERBI', 'TABLEAU', 'CSV', 'S3', 'WAREHOUSE')),
  dataset_key VARCHAR(120) NOT NULL,
  read_only_endpoint TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  requested_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS read_only_api_tokens (
  api_token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  token_name VARCHAR(120) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  allowed_ips TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 9. Reports & Dashboards Required
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_catalog (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  report_key VARCHAR(100) NOT NULL,
  report_name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  default_format VARCHAR(10) NOT NULL DEFAULT 'CSV'
    CHECK (default_format IN ('CSV', 'PDF', 'XLSX', 'JSON')),
  required_permission VARCHAR(120),
  query_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, report_key)
);

CREATE TABLE IF NOT EXISTS report_export_jobs (
  export_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES report_catalog(report_id) ON DELETE CASCADE,
  requested_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  export_format VARCHAR(10) NOT NULL CHECK (export_format IN ('CSV', 'PDF', 'XLSX', 'JSON')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  file_url TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 11. Documents (Central Repository)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  category_key VARCHAR(100) NOT NULL,
  category_name VARCHAR(180) NOT NULL,
  parent_category_id UUID NULL REFERENCES document_categories(category_id) ON DELETE SET NULL,
  UNIQUE (tenant_id, category_key)
);

CREATE TABLE IF NOT EXISTS dms_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  category_id UUID NULL REFERENCES document_categories(category_id) ON DELETE SET NULL,
  title VARCHAR(220) NOT NULL,
  document_type VARCHAR(80) NOT NULL,
  description TEXT,
  current_version INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED', 'SUPERSEDED')),
  created_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dms_document_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES dms_documents(document_id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  file_url TEXT NOT NULL,
  checksum VARCHAR(128),
  uploaded_by_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_no)
);

CREATE TABLE IF NOT EXISTS dms_access_policies (
  access_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES dms_documents(document_id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (document_id, role_id)
);

CREATE TABLE IF NOT EXISTS generated_document_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  template_key VARCHAR(100) NOT NULL,
  template_name VARCHAR(180) NOT NULL,
  output_type VARCHAR(20) NOT NULL DEFAULT 'PDF'
    CHECK (output_type IN ('PDF', 'HTML', 'DOCX')),
  template_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, template_key)
);

-- ---------------------------------------------------------------------------
-- Indexes for newly added high-volume surfaces
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_applications_status ON student_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_document_verifications_student ON student_document_verifications(tenant_id, student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_academic_records_student ON academic_records(tenant_id, student_user_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_course_assessments_student ON student_course_assessments(tenant_id, student_user_id, semester);
CREATE INDEX IF NOT EXISTS idx_backlog_history_student ON student_backlog_history(tenant_id, student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ncc_nss_student ON ncc_nss_sodeca_records(tenant_id, student_user_id, program_type);
CREATE INDEX IF NOT EXISTS idx_grievance_status ON student_grievance_tickets(tenant_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_company_master_name ON company_master(tenant_id, company_name);
CREATE INDEX IF NOT EXISTS idx_placement_applications_student ON placement_applications(tenant_id, student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_training_calendar_date ON training_calendar(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_batch ON alumni_profiles(tenant_id, batch_year, verification_status);
CREATE INDEX IF NOT EXISTS idx_faculty_publications_user ON faculty_publications(tenant_id, faculty_user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_faculty ON student_feedback_records(tenant_id, faculty_user_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_biometric_events_employee_time ON biometric_attendance_events(tenant_id, employee_user_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_gst_tds_period ON finance_gst_tds_tracking(tenant_id, tax_period, source_type);
CREATE INDEX IF NOT EXISTS idx_room_allocations_space_time ON timetable_room_allocations(tenant_id, space_id, allocation_date, start_time);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_type_status ON integration_jobs(tenant_id, integration_type, status);
CREATE INDEX IF NOT EXISTS idx_report_exports_status ON report_export_jobs(tenant_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_dms_documents_category ON dms_documents(tenant_id, category_id, status);

-- ---------------------------------------------------------------------------
-- SGVU smoke/catalog seeds
-- ---------------------------------------------------------------------------
INSERT INTO permissions (permission_key, description)
VALUES
  ('matrix_exams_marks', 'Exam marks view/edit/approve matrix permission'),
  ('matrix_hr_leave_requests', 'Leave request view/edit/approve matrix permission'),
  ('matrix_finance_gst_tds', 'GST and TDS view/edit/approve matrix permission'),
  ('matrix_placement_drives', 'Placement drive view/edit/approve matrix permission'),
  ('matrix_iqac_naac_metrics', 'NAAC metrics view/edit/approve matrix permission'),
  ('matrix_students_academic_records', 'Academic records view/edit/approve matrix permission'),
  ('matrix_reports_executive_dashboards', 'Executive dashboard view/edit/approve matrix permission')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
role_map AS (
  SELECT role_id, role_name FROM roles
),
permission_map AS (
  SELECT permission_id, permission_key FROM permissions
)
INSERT INTO role_permissions (tenant_id, role_id, permission_id, module_key, resource_key, can_view, can_edit, can_approve, scope)
SELECT tenant.tenant_id, role_map.role_id, permission_map.permission_id, data.module_key, data.resource_key, data.can_view, data.can_edit, data.can_approve, data.scope
FROM tenant
CROSS JOIN (VALUES
  ('Exam Cell', 'matrix_exams_marks', 'exams', 'marks', TRUE, TRUE, FALSE, 'TENANT'),
  ('Student', 'matrix_exams_marks', 'exams', 'marks', TRUE, FALSE, FALSE, 'SELF'),
  ('HoD', 'matrix_hr_leave_requests', 'hr', 'leave_requests', TRUE, FALSE, TRUE, 'DEPARTMENT'),
  ('Accounts', 'matrix_finance_gst_tds', 'finance', 'gst_tds', TRUE, TRUE, TRUE, 'TENANT'),
  ('Placement Officer', 'matrix_placement_drives', 'placement', 'drives', TRUE, TRUE, TRUE, 'TENANT'),
  ('IQAC Coordinator', 'matrix_iqac_naac_metrics', 'iqac', 'naac_metrics', TRUE, TRUE, TRUE, 'TENANT'),
  ('Registrar', 'matrix_students_academic_records', 'students', 'academic_records', TRUE, TRUE, TRUE, 'TENANT'),
  ('Chancellor', 'matrix_reports_executive_dashboards', 'reports', 'executive_dashboards', TRUE, FALSE, TRUE, 'UNIVERSITY')
) AS data(role_name, permission_key, module_key, resource_key, can_view, can_edit, can_approve, scope)
JOIN role_map ON role_map.role_name = data.role_name
JOIN permission_map ON permission_map.permission_key = data.permission_key
ON CONFLICT (tenant_id, role_id, module_key, resource_key) DO UPDATE SET
  permission_id = EXCLUDED.permission_id,
  can_view = EXCLUDED.can_view,
  can_edit = EXCLUDED.can_edit,
  can_approve = EXCLUDED.can_approve,
  scope = EXCLUDED.scope,
  updated_at = NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO report_catalog (tenant_id, report_key, report_name, category, default_format, required_permission)
SELECT tenant.tenant_id, data.report_key, data.report_name, data.category, data.default_format, data.required_permission
FROM tenant
CROSS JOIN (VALUES
  ('admission_trends', 'Admission Trends', 'Admissions', 'CSV', 'reports.admissions.view'),
  ('enrollment_statistics', 'Enrollment Statistics', 'Students', 'CSV', 'reports.students.view'),
  ('department_strength', 'Department-wise Strength', 'Students', 'CSV', 'reports.students.view'),
  ('fee_pending_report', 'Fee Pending Report', 'Finance', 'CSV', 'reports.finance.view'),
  ('placement_report', 'Placement Report', 'Placement', 'CSV', 'reports.placement.view'),
  ('faculty_workload', 'Faculty Workload', 'Academics', 'CSV', 'reports.academics.view'),
  ('naac_kpi_dashboard', 'NAAC KPI Dashboard', 'IQAC', 'PDF', 'reports.iqac.view'),
  ('attendance_analytics', 'Attendance Analytics', 'Academics', 'CSV', 'reports.attendance.view'),
  ('scholarship_utilization', 'Scholarship Utilization', 'Finance', 'CSV', 'reports.finance.view'),
  ('student_progression', 'Student Progression', 'Academics', 'CSV', 'reports.academics.view')
) AS data(report_key, report_name, category, default_format, required_permission)
ON CONFLICT (tenant_id, report_key) DO UPDATE SET
  report_name = EXCLUDED.report_name,
  category = EXCLUDED.category,
  default_format = EXCLUDED.default_format,
  required_permission = EXCLUDED.required_permission;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO document_categories (tenant_id, category_key, category_name)
SELECT tenant.tenant_id, data.category_key, data.category_name
FROM tenant
CROSS JOIN (VALUES
  ('university_rules', 'University Rules'),
  ('ordinances', 'Ordinances'),
  ('academic_regulations', 'Academic Regulations'),
  ('credit_system', 'Credit System'),
  ('nep_rules', 'NEP Rules'),
  ('examination_rules', 'Examination Rules'),
  ('evaluation_policy', 'Evaluation Policy'),
  ('attendance_policy', 'Attendance Policy'),
  ('hr_policies', 'HR Policies'),
  ('leave_rules', 'Leave Rules'),
  ('finance_procedures', 'Finance Procedures'),
  ('procurement_rules', 'Procurement Rules'),
  ('accreditation', 'Accreditation'),
  ('naac_ssr', 'NAAC SSR'),
  ('aqar', 'AQAR'),
  ('nirf_submissions', 'NIRF Submissions'),
  ('aicte_approvals', 'AICTE Approvals'),
  ('templates_formats', 'Templates & Formats')
) AS data(category_key, category_name)
ON CONFLICT (tenant_id, category_key) DO UPDATE SET
  category_name = EXCLUDED.category_name;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO generated_document_templates (tenant_id, template_key, template_name, output_type)
SELECT tenant.tenant_id, data.template_key, data.template_name, 'PDF'
FROM tenant
CROSS JOIN (VALUES
  ('admission_form', 'Admission Form'),
  ('marksheet_format', 'Marksheet Format'),
  ('id_card', 'ID Card'),
  ('bonafide_certificate', 'Bonafide Certificate'),
  ('degree_format', 'Degree Format'),
  ('fee_receipt', 'Fee Receipt')
) AS data(template_key, template_name)
ON CONFLICT (tenant_id, template_key) DO UPDATE SET
  template_name = EXCLUDED.template_name;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO integration_connectors (tenant_id, connector_type, display_name, status, config)
SELECT tenant.tenant_id, data.connector_type, data.display_name, data.status, data.config::jsonb
FROM tenant
CROSS JOIN (VALUES
  ('DIGILOCKER', 'DigiLocker Sandbox', 'SANDBOX_PENDING', '{"required_credentials":["client_id","client_secret","redirect_uri"]}'),
  ('ABC', 'Academic Bank of Credits Sandbox', 'SANDBOX_PENDING', '{"required_credentials":["client_id","client_secret"]}'),
  ('NAD', 'National Academic Depository', 'SANDBOX_PENDING', '{"required_credentials":["api_key","institution_id"]}'),
  ('WHATSAPP', 'WhatsApp Business API', 'SANDBOX_PENDING', '{"required_credentials":["phone_number_id","access_token"]}'),
  ('MOODLE', 'Moodle SSO', 'CONFIGURED', '{"sso":"oauth2"}'),
  ('POWERBI', 'Power BI Read-only Export', 'CONFIGURED', '{"mode":"read_only_api"}')
) AS data(connector_type, display_name, status, config)
ON CONFLICT (tenant_id, connector_type, display_name) DO UPDATE SET
  status = EXCLUDED.status,
  config = EXCLUDED.config,
  updated_at = NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
)
INSERT INTO sso_bridges (tenant_id, provider, oauth_client_id, oauth_metadata, launch_url, status)
SELECT tenant.tenant_id, 'MOODLE', NULL, '{"credential_status":"pending_university_it"}'::jsonb, 'https://moodle.example.edu/login/index.php', 'CONFIGURED'
FROM tenant
ON CONFLICT (tenant_id, provider) DO UPDATE SET
  oauth_metadata = EXCLUDED.oauth_metadata,
  launch_url = EXCLUDED.launch_url,
  status = EXCLUDED.status;
