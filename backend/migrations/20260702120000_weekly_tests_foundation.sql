-- Update exam_type check on academic_marks to include WT1, WT2, GA1, GA2, MTE1, MTE2, ETE
ALTER TABLE academic_marks DROP CONSTRAINT IF EXISTS academic_marks_exam_type_check;
ALTER TABLE academic_marks ADD CONSTRAINT academic_marks_exam_type_check
  CHECK (exam_type IN ('CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT', 'DA1', 'DA2', 'WT1', 'WT2', 'GA1', 'GA2', 'MTE1', 'MTE2', 'ETE'));

-- Create weekly_tests table
CREATE TABLE IF NOT EXISTS weekly_tests (
  test_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  course_id UUID NOT NULL REFERENCES academic_courses(course_id),
  test_type VARCHAR(10) NOT NULL CHECK (test_type IN ('WT1', 'WT2')),
  question_paper_url TEXT NOT NULL,
  answer_key JSONB,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_tests_tenant_course ON weekly_tests(tenant_id, course_id);
CREATE INDEX IF NOT EXISTS idx_weekly_tests_status_times ON weekly_tests(status, start_time, end_time);

-- Create weekly_test_responses table
CREATE TABLE IF NOT EXISTS weekly_test_responses (
  response_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES weekly_tests(test_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  answers JSONB,
  score NUMERIC(5,2),
  submitted_at TIMESTAMPTZ,
  violation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(test_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_test_resps_student ON weekly_test_responses(student_user_id);
