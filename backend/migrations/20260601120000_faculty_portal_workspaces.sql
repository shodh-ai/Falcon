-- Faculty portal workspaces: grading, timetable adjustments, research logs, projects, logbook.

ALTER TABLE academic_assignments ADD COLUMN IF NOT EXISTS allow_late_submission BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE academic_assignments ADD COLUMN IF NOT EXISTS late_penalty_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS academic_marks (
  mark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  exam_type VARCHAR(50) NOT NULL CHECK (exam_type IN ('CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT')),
  marks_obtained NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_marks INT NOT NULL,
  co_mapped VARCHAR(10),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  uploaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, course_id, exam_type)
);

CREATE TABLE IF NOT EXISTS course_co_po_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  co_code VARCHAR(10) NOT NULL,
  po_code VARCHAR(10) NOT NULL,
  question_ref VARCHAR(80),
  weight_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  attainment_percent NUMERIC(5,2),
  academic_year VARCHAR(12) NOT NULL,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, course_id, co_code, po_code, question_ref, academic_year)
);

CREATE TABLE IF NOT EXISTS class_adjustments (
  adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  adjustment_type VARCHAR(30) NOT NULL DEFAULT 'EXTRA_CLASS'
    CHECK (adjustment_type IN ('EXTRA_CLASS', 'CANCEL', 'SUBSTITUTE')),
  original_date TIMESTAMPTZ,
  new_date TIMESTAMPTZ,
  substitute_faculty_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_HOD_APPROVAL'
    CHECK (status IN ('PENDING_HOD_APPROVAL', 'APPROVED', 'REJECTED', 'NOTIFIED')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_research_logs (
  research_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  publication_title TEXT NOT NULL,
  journal_name VARCHAR(255),
  indexing_type VARCHAR(50) CHECK (indexing_type IN ('SCOPUS', 'WOS', 'UGC_CARE', 'OTHER')),
  publication_type VARCHAR(40) NOT NULL DEFAULT 'JOURNAL'
    CHECK (publication_type IN ('JOURNAL', 'CONFERENCE', 'PATENT', 'BOOK', 'BOOK_CHAPTER')),
  published_date DATE,
  proof_file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_invigilation_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  exam_date DATE NOT NULL,
  block_name VARCHAR(80),
  room VARCHAR(80) NOT NULL,
  session_label VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculty_project_guides (
  guide_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  project_title VARCHAR(255) NOT NULL,
  program VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ON_HOLD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, faculty_user_id, student_user_id, project_title)
);

CREATE TABLE IF NOT EXISTS project_weekly_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES faculty_project_guides(guide_id) ON DELETE CASCADE,
  week_no INT NOT NULL,
  report_summary TEXT NOT NULL,
  report_file_path TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED', 'APPROVED', 'REVISION_REQUESTED')),
  ce_marks NUMERIC(5,2),
  faculty_remarks TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (guide_id, week_no)
);

CREATE TABLE IF NOT EXISTS faculty_class_logbook (
  logbook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  class_date DATE NOT NULL,
  topic_summary TEXT NOT NULL,
  attendance_log_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, course_id, faculty_user_id, class_date)
);

CREATE TABLE IF NOT EXISTS faculty_remedial_actions (
  remedial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  reason VARCHAR(80) NOT NULL,
  action_taken TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'LOGGED' CHECK (status IN ('LOGGED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_lesson_plans (
  lesson_plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  handout_url TEXT,
  units JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, course_id, faculty_user_id)
);

CREATE INDEX IF NOT EXISTS idx_academic_marks_course_exam ON academic_marks(tenant_id, course_id, exam_type);
CREATE INDEX IF NOT EXISTS idx_class_adjustments_faculty ON class_adjustments(tenant_id, faculty_user_id, status);
CREATE INDEX IF NOT EXISTS idx_faculty_research_logs_user ON faculty_research_logs(tenant_id, faculty_user_id);
CREATE INDEX IF NOT EXISTS idx_invigilation_faculty_date ON faculty_invigilation_assignments(tenant_id, faculty_user_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_project_guides_faculty ON faculty_project_guides(tenant_id, faculty_user_id);

-- Smoke: invigilation duty for faculty1
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO faculty_invigilation_assignments (tenant_id, faculty_user_id, exam_date, block_name, room, session_label)
SELECT tenant.tenant_id, faculty.user_id, CURRENT_DATE + 14, 'Block A', 'A-204', 'End-Term — CSE301'
FROM tenant, faculty
WHERE NOT EXISTS (
  SELECT 1 FROM faculty_invigilation_assignments i
  WHERE i.faculty_user_id = faculty.user_id AND i.room = 'A-204'
);
