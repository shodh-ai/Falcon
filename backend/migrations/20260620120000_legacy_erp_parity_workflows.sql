-- Legacy ERP parity: proxy teaching, study groups, cheques, announcements, master data

-- 1. Proxy / alternate teaching arrangement
CREATE TABLE IF NOT EXISTS academic_proxy_requests (
  proxy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  timetable_id UUID REFERENCES academic_timetables(timetable_id) ON DELETE SET NULL,
  absent_faculty_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  proxy_faculty_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  date_of_proxy DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_HOD_APPROVAL'
    CHECK (status IN ('PENDING_HOD_APPROVAL', 'APPROVED', 'REJECTED')),
  hod_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_proxy_requests_hod
  ON academic_proxy_requests(tenant_id, status, date_of_proxy);
CREATE INDEX IF NOT EXISTS idx_academic_proxy_requests_proxy_faculty
  ON academic_proxy_requests(tenant_id, proxy_faculty_id, date_of_proxy, status);

-- 2. Class adjustments: add SUSPENSION type
ALTER TABLE class_adjustments DROP CONSTRAINT IF EXISTS class_adjustments_adjustment_type_check;
ALTER TABLE class_adjustments ADD CONSTRAINT class_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('EXTRA_CLASS', 'CANCEL', 'SUBSTITUTE', 'SUSPENSION'));

-- 3. Lesson plan / course modules — plan vs actual
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS planned_completion_date DATE;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS actual_completion_date DATE;
ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS hod_approval_status VARCHAR(50) DEFAULT 'PENDING'
  CHECK (hod_approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- 4. Per-session attendance (back-to-back hours)
ALTER TABLE course_attendance_logs ADD COLUMN IF NOT EXISTS timetable_id UUID REFERENCES academic_timetables(timetable_id) ON DELETE SET NULL;

ALTER TABLE course_attendance_logs DROP CONSTRAINT IF EXISTS course_attendance_logs_tenant_id_course_id_faculty_user_id_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_attendance_logs_session_unique
  ON course_attendance_logs(
    tenant_id, course_id, faculty_user_id, date,
    COALESCE(timetable_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 5. E-learning study groups
CREATE TABLE IF NOT EXISTS course_study_groups (
  group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  group_name VARCHAR(100) NOT NULL,
  is_compulsory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_study_group_members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES course_study_groups(group_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_study_groups_course ON course_study_groups(tenant_id, course_id);

ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS study_group_id UUID REFERENCES course_study_groups(group_id) ON DELETE SET NULL;

-- 6. Offline cheque tracking
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(50);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS clearance_date DATE;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS bounce_reason TEXT;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS cheque_status VARCHAR(30)
  CHECK (cheque_status IS NULL OR cheque_status IN ('PENDING_CLEARANCE', 'CLEARED', 'BOUNCED'));

-- 7. Campus announcements CMS
CREATE TABLE IF NOT EXISTS campus_announcements (
  announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  target_all_students BOOLEAN NOT NULL DEFAULT false,
  target_all_faculty BOOLEAN NOT NULL DEFAULT false,
  target_dept_ids INT[] DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campus_announcements_published
  ON campus_announcements(tenant_id, is_published, published_at DESC);

-- 8. Deep master configurations
CREATE TABLE IF NOT EXISTS master_countries (
  country_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS master_states (
  state_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  country_id INT NOT NULL REFERENCES master_countries(country_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, country_id, name)
);

CREATE TABLE IF NOT EXISTS master_cities (
  city_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  state_id INT NOT NULL REFERENCES master_states(state_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, state_id, name)
);

CREATE TABLE IF NOT EXISTS master_castes (
  caste_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS master_categories (
  category_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS master_religions (
  religion_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS enrollment_id_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  rule_name VARCHAR(100) NOT NULL,
  template VARCHAR(200) NOT NULL,
  seq_padding INT NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, rule_name)
);

CREATE TABLE IF NOT EXISTS enrollment_id_counters (
  counter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES enrollment_id_rules(rule_id) ON DELETE CASCADE,
  context_key VARCHAR(100) NOT NULL,
  last_seq INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, rule_id, context_key)
);
