-- Executive Leadership Portal: Chairman role, materialized views, specialized engine tables

INSERT INTO roles (role_name, description)
VALUES ('Chairman', 'Executive read-only analytics for Chairman, Chief Mentor, and Directors')
ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description;

-- Chairman persona (password123)
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
chairman_role AS (
  SELECT role_id FROM roles WHERE role_name = 'Chairman' LIMIT 1
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, password_hash, is_active
)
SELECT
  'c0000001-0000-4000-8000-000000000001'::uuid,
  t.tenant_id,
  'Chief Mentor / Chairman',
  'chairman@mygyanvihar.com',
  r.role_id,
  '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO',
  true
FROM tenant t
CROSS JOIN chairman_role r
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true;

-- Ph.D. lifecycle
CREATE TABLE IF NOT EXISTS research_scholars (
  scholar_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  guide_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  research_topic TEXT NOT NULL,
  current_phase VARCHAR(50) NOT NULL DEFAULT 'COURSEWORK',
  synopsis_approved BOOLEAN NOT NULL DEFAULT false,
  thesis_submitted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_scholars_tenant ON research_scholars(tenant_id, current_phase);

-- Research grants micro-ledger
CREATE TABLE IF NOT EXISTS research_grants (
  grant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  principal_investigator_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  funding_agency VARCHAR(100) NOT NULL,
  grant_title TEXT NOT NULL,
  sanctioned_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  utilized_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  equipment_purchases NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS research_grant_expenses (
  expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES research_grants(grant_id) ON DELETE CASCADE,
  expense_type VARCHAR(50) NOT NULL,
  description TEXT,
  amount NUMERIC(14, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campus infirmary
CREATE TABLE IF NOT EXISTS clinic_records (
  visit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  patient_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  doctor_name VARCHAR(100),
  diagnosis TEXT,
  rest_advised_days INT NOT NULL DEFAULT 0,
  visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_records_patient ON clinic_records(tenant_id, patient_user_id, visit_date DESC);

-- NBA CO-PO exam question mapping (executive attainment engine)
CREATE TABLE IF NOT EXISTS academic_co_po_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  question_number VARCHAR(10) NOT NULL,
  mapped_co VARCHAR(10) NOT NULL,
  max_marks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_co_po_course ON academic_co_po_mappings(tenant_id, course_id);

-- Merit counseling seat matrix
CREATE TABLE IF NOT EXISTS admission_counseling_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  academic_year VARCHAR(20) NOT NULL,
  quota_sc_pct NUMERIC(5, 2) NOT NULL DEFAULT 15,
  quota_st_pct NUMERIC(5, 2) NOT NULL DEFAULT 15,
  quota_general_pct NUMERIC(5, 2) NOT NULL DEFAULT 70,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_seat_matrix (
  seat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  program_code VARCHAR(50) NOT NULL,
  program_name VARCHAR(200) NOT NULL,
  total_seats INT NOT NULL DEFAULT 0,
  filled_seats INT NOT NULL DEFAULT 0,
  academic_year VARCHAR(20) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, program_code, academic_year)
);

CREATE TABLE IF NOT EXISTS admission_merit_ranks (
  rank_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  applicant_name VARCHAR(200) NOT NULL,
  entrance_score NUMERIC(8, 2) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
  merit_rank INT NOT NULL,
  counseling_date DATE,
  program_preference VARCHAR(100),
  academic_year VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Executive drill-down snapshot (refreshed nightly; avoids live COUNT on attendance)
CREATE TABLE IF NOT EXISTS exec_attendance_drilldown (
  drill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  level VARCHAR(20) NOT NULL,
  parent_key VARCHAR(120),
  node_key VARCHAR(120) NOT NULL,
  label VARCHAR(200) NOT NULL,
  attendance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, level, node_key)
);

CREATE INDEX IF NOT EXISTS idx_exec_drilldown_parent ON exec_attendance_drilldown(tenant_id, level, parent_key);

-- Materialized views for executive dashboard (refreshed at 2 AM)
DROP MATERIALIZED VIEW IF EXISTS exec_daily_university_health;
CREATE MATERIALIZED VIEW exec_daily_university_health AS
SELECT
  t.tenant_id,
  (SELECT COUNT(*)::int FROM users u
   JOIN roles r ON r.role_id = u.role_id
   WHERE u.tenant_id = t.tenant_id AND u.is_active = true AND r.role_name = 'Student') AS total_students,
  (SELECT COUNT(*)::int FROM users u
   JOIN roles r ON r.role_id = u.role_id
   WHERE u.tenant_id = t.tenant_id AND u.is_active = true
     AND r.role_name IN ('Faculty', 'HOD', 'Dean')) AS total_faculty,
  COALESCE((
    SELECT SUM(ft.amount)::numeric FROM finance_transactions ft
    WHERE ft.tenant_id = t.tenant_id AND ft.status = 'SUCCESS'
      AND DATE(ft.created_at) = CURRENT_DATE
  ), 0)::numeric(14, 2) AS revenue_today,
  COALESCE((
    SELECT ROUND(AVG(e.attendance_percent)::numeric, 2)
    FROM student_course_enrollments e
    WHERE e.tenant_id = t.tenant_id
  ), 0)::numeric(5, 2) AS avg_attendance,
  COALESCE((
    SELECT COUNT(*)::int FROM finance_fee_demands fd
    WHERE fd.tenant_id = t.tenant_id AND fd.status IN ('OVERDUE', 'PARTIALLY_PAID')
  ), 0) AS fee_defaulter_count,
  COALESCE((
    SELECT SUM(sp.net_pay)::numeric FROM staff_payslips sp
    WHERE sp.tenant_id = t.tenant_id
      AND DATE_TRUNC('month', sp.generated_at) = DATE_TRUNC('month', CURRENT_DATE)
  ), 0)::numeric(14, 2) AS salary_disbursement_month,
  NOW() AS refreshed_at
FROM public.tenants t;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exec_daily_health_tenant ON exec_daily_university_health(tenant_id);

DROP MATERIALIZED VIEW IF EXISTS exec_mv_finance_summary;
CREATE MATERIALIZED VIEW exec_mv_finance_summary AS
SELECT
  fd.tenant_id,
  DATE_TRUNC('month', fd.created_at)::date AS month,
  COALESCE(SUM(fd.paid_amount), 0)::numeric(14, 2) AS revenue,
  COALESCE(SUM(fd.total_amount - fd.paid_amount), 0)::numeric(14, 2) AS outstanding,
  COALESCE(d.dept_name, 'Unassigned') AS department
FROM finance_fee_demands fd
LEFT JOIN users u ON u.user_id = fd.student_user_id
LEFT JOIN departments d ON d.dept_id = u.dept_id
GROUP BY fd.tenant_id, DATE_TRUNC('month', fd.created_at), d.dept_name;

CREATE INDEX IF NOT EXISTS idx_exec_mv_finance ON exec_mv_finance_summary(tenant_id, month);

DROP MATERIALIZED VIEW IF EXISTS exec_mv_academic_schools;
CREATE MATERIALIZED VIEW exec_mv_academic_schools AS
SELECT
  e.tenant_id,
  COALESCE(d.dept_name, 'University-wide') AS school_name,
  COUNT(*) FILTER (WHERE e.status = 'COMPLETED')::int AS pass_count,
  COUNT(*) FILTER (WHERE e.status = 'FAILED')::int AS fail_count,
  ROUND(AVG(e.attendance_percent)::numeric, 2) AS avg_attendance,
  ROUND(AVG(NULLIF(e.grade_points, 0)::numeric), 2) AS avg_cgpa_proxy
FROM student_course_enrollments e
JOIN users u ON u.user_id = e.student_user_id
LEFT JOIN departments d ON d.dept_id = u.dept_id
GROUP BY e.tenant_id, d.dept_name;

CREATE INDEX IF NOT EXISTS idx_exec_mv_academic_schools ON exec_mv_academic_schools(tenant_id);

DROP MATERIALIZED VIEW IF EXISTS exec_mv_placement_trends;
CREATE MATERIALIZED VIEW exec_mv_placement_trends AS
SELECT
  u.tenant_id,
  EXTRACT(YEAR FROM jp.created_at)::int AS placement_year,
  ROUND(AVG(jp.ctc_lpa)::numeric, 2) AS avg_lpa,
  ROUND(MAX(jp.ctc_lpa)::numeric, 2) AS highest_lpa,
  COUNT(DISTINCT pja.student_user_id) FILTER (WHERE pja.status IN ('ACCEPTED', 'OFFERED'))::int AS placed_count
FROM placement_job_postings jp
JOIN placement_job_applications pja ON pja.job_id = jp.job_id
JOIN users u ON u.user_id = pja.student_user_id
WHERE jp.ctc_lpa IS NOT NULL
GROUP BY u.tenant_id, EXTRACT(YEAR FROM jp.created_at);

CREATE INDEX IF NOT EXISTS idx_exec_mv_placement ON exec_mv_placement_trends(tenant_id, placement_year);

REFRESH MATERIALIZED VIEW exec_daily_university_health;
REFRESH MATERIALIZED VIEW exec_mv_finance_summary;
REFRESH MATERIALIZED VIEW exec_mv_academic_schools;
REFRESH MATERIALIZED VIEW exec_mv_placement_trends;

-- Demo drill-down chain: Engineering -> CSE -> Physics 101 -> Dr. Sharma
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO exec_attendance_drilldown (tenant_id, level, parent_key, node_key, label, attendance_pct, meta, sort_order)
SELECT t.tenant_id, v.level, v.parent_key, v.node_key, v.label, v.attendance_pct, v.meta::jsonb, v.sort_order
FROM tenant t
CROSS JOIN (VALUES
  ('school', NULL, 'school:engineering', 'School of Engineering', 62.00, '{"alert": true}', 1),
  ('department', 'school:engineering', 'dept:cse', 'Computer Science', 45.00, '{"alert": true}', 1),
  ('course', 'dept:cse', 'course:phy101', 'Physics 101', 20.00, '{"alert": true}', 1),
  ('faculty', 'course:phy101', 'faculty:sharma', 'Dr. Sharma', 20.00, '{"cancelled_classes_this_week": 4, "faculty_user_id": "b0000003-0000-4000-8000-000000000003"}', 1)
) AS v(level, parent_key, node_key, label, attendance_pct, meta, sort_order)
ON CONFLICT (tenant_id, level, node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key,
  label = EXCLUDED.label,
  attendance_pct = EXCLUDED.attendance_pct,
  meta = EXCLUDED.meta,
  sort_order = EXCLUDED.sort_order;

-- Demo research scholar
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO research_scholars (tenant_id, student_user_id, guide_user_id, research_topic, current_phase, synopsis_approved)
SELECT t.tenant_id,
  'b0000001-0000-4000-8000-000000000001'::uuid,
  'b0000003-0000-4000-8000-000000000003'::uuid,
  'Deep Learning for Agricultural Yield Prediction',
  'SYNOPSIS_SUBMISSION',
  false
FROM tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM research_scholars rs
  WHERE rs.tenant_id = t.tenant_id
    AND rs.student_user_id = 'b0000001-0000-4000-8000-000000000001'::uuid
);

-- Demo counseling seat matrix
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO admission_seat_matrix (tenant_id, program_code, program_name, total_seats, filled_seats, academic_year)
SELECT t.tenant_id, v.program_code, v.program_name, v.total_seats, v.filled_seats, '2026-27'
FROM tenant t
CROSS JOIN (VALUES
  ('BTECH-CSE', 'B.Tech Computer Science', 120, 45),
  ('BTECH-ME', 'B.Tech Mechanical', 60, 38),
  ('MBA', 'MBA General Management', 90, 72)
) AS v(program_code, program_name, total_seats, filled_seats)
ON CONFLICT (tenant_id, program_code, academic_year) DO UPDATE SET
  filled_seats = EXCLUDED.filled_seats,
  updated_at = NOW();
