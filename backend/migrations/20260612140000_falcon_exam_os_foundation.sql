-- Falcon Exam OS — scheduling, seating matrix, invigilation, results pipeline

ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id);
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS max_marks INT DEFAULT 100;
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'SCHEDULED';
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS batch_label VARCHAR(80);

UPDATE exam_schedules SET tenant_id = t.tenant_id
FROM tenants t WHERE t.subdomain = 'sgvu' AND exam_schedules.tenant_id IS NULL;

-- Per-student seating matrix (burnable hall ticket data lives in exams module)
CREATE TABLE IF NOT EXISTS exam_seating_allocations (
  seating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(exam_schedule_id) ON DELETE CASCADE,
  room VARCHAR(80) NOT NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  seat_number VARCHAR(20) NOT NULL,
  branch_code VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_schedule_id, student_user_id),
  UNIQUE (exam_schedule_id, room, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_exam_seating_alloc_exam ON exam_seating_allocations(exam_schedule_id);

-- Invigilation duty roster (COE → faculty portal sync)
CREATE TABLE IF NOT EXISTS exam_invigilation_duties (
  duty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(exam_schedule_id) ON DELETE CASCADE,
  room VARCHAR(80) NOT NULL,
  faculty_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_schedule_id, room, faculty_user_id)
);

-- Admit card batch generation audit
CREATE TABLE IF NOT EXISTS exam_admit_card_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  batch_label VARCHAR(80) NOT NULL,
  semester INT,
  generated_count INT NOT NULL DEFAULT 0,
  blocked_count INT NOT NULL DEFAULT 0,
  run_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_admit_card_entries (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES exam_admit_card_runs(run_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  eligible BOOLEAN NOT NULL,
  block_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Published exam results (entity existed without migration)
CREATE TABLE IF NOT EXISTS academic_exam_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  course_id UUID REFERENCES academic_courses(course_id),
  exam_type VARCHAR(30) NOT NULL,
  marks_obtained NUMERIC(6,2) NOT NULL,
  max_marks NUMERIC(6,2) NOT NULL,
  grade VARCHAR(5),
  status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend academic_marks workflow: faculty → PENDING_COE → COE publishes
ALTER TABLE academic_marks DROP CONSTRAINT IF EXISTS academic_marks_status_check;
ALTER TABLE academic_marks ADD CONSTRAINT academic_marks_status_check
  CHECK (status IN ('DRAFT', 'PENDING_COE', 'PUBLISHED'));

ALTER TABLE exam_applications DROP CONSTRAINT IF EXISTS chk_exam_applications_status;
ALTER TABLE exam_applications ADD CONSTRAINT chk_exam_applications_status
  CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));

ALTER TABLE ufm_cases ADD COLUMN IF NOT EXISTS reported_by UUID REFERENCES users(user_id);
ALTER TABLE ufm_cases ADD COLUMN IF NOT EXISTS marks_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Sample exam schedules for QA
INSERT INTO exam_schedules (tenant_id, exam_type, subject_id, exam_date, start_time, end_time, venue, max_marks, status, batch_label)
SELECT t.tenant_id, v.exam_type, s.subject_id, v.exam_date, v.start_time, v.end_time, v.venue, v.max_marks, 'SCHEDULED', 'B.Tech Sem 4'
FROM tenants t
CROSS JOIN (VALUES
  ('MID_TERM', CURRENT_DATE + 14, '09:00'::time, '12:00'::time, 'Block A Hall 1', 50),
  ('END_TERM', CURRENT_DATE + 28, '09:00'::time, '12:00'::time, 'Block A Hall 1', 100)
) AS v(exam_type, exam_date, start_time, end_time, venue, max_marks)
CROSS JOIN LATERAL (
  SELECT subject_id FROM academic_subjects LIMIT 1
) s
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM exam_schedules WHERE batch_label = 'B.Tech Sem 4' LIMIT 1);
