-- Course announcements (faculty LMS) + simple question bank for weekly tests.

CREATE TABLE IF NOT EXISTS course_announcements (
  announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_course_announcements_course
  ON course_announcements (tenant_id, course_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS faculty_question_bank (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID NULL REFERENCES academic_courses(course_id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  option_a VARCHAR(500) NOT NULL,
  option_b VARCHAR(500) NOT NULL,
  option_c VARCHAR(500) NOT NULL,
  option_d VARCHAR(500) NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  tags VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_faculty_question_bank_owner
  ON faculty_question_bank (tenant_id, faculty_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
