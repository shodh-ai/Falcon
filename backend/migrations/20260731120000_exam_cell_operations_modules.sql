-- Examination Cell operations: form windows, semester registrations, QP workflow, exam-day attendance

CREATE TABLE IF NOT EXISTS exam_form_windows (
  window_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  session_id UUID REFERENCES exam_sessions(session_id) ON DELETE SET NULL,
  title VARCHAR(120) NOT NULL,
  semester INT NOT NULL,
  program_label VARCHAR(80),
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_form_windows_tenant_status
  ON exam_form_windows(tenant_id, status);

CREATE TABLE IF NOT EXISTS exam_semester_registrations (
  registration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  window_id UUID REFERENCES exam_form_windows(window_id) ON DELETE SET NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_id UUID REFERENCES exam_sessions(session_id) ON DELETE SET NULL,
  semester INT NOT NULL,
  fee_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (fee_status IN ('PENDING', 'PAID', 'WAIVED')),
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (window_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_sem_reg_tenant_status
  ON exam_semester_registrations(tenant_id, status);

CREATE TABLE IF NOT EXISTS exam_question_papers (
  qp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  exam_schedule_id UUID REFERENCES exam_schedules(exam_schedule_id) ON DELETE SET NULL,
  subject_id INT,
  setter_user_id UUID REFERENCES users(user_id),
  status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED'
    CHECK (status IN (
      'UPLOADED', 'UNDER_MODERATION', 'COE_APPROVED', 'PRINT_AUTHORIZED', 'REJECTED'
    )),
  storage_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(user_id),
  approved_by UUID REFERENCES users(user_id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_qp_tenant_status
  ON exam_question_papers(tenant_id, status);

CREATE TABLE IF NOT EXISTS exam_day_attendance (
  attendance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(exam_schedule_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PRESENT'
    CHECK (status IN ('PRESENT', 'ABSENT', 'MEDICAL', 'DEBARRED', 'LATE')),
  marked_by UUID REFERENCES users(user_id),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_schedule_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_day_att_tenant_schedule
  ON exam_day_attendance(tenant_id, exam_schedule_id);

CREATE TABLE IF NOT EXISTS exam_notification_campaigns (
  campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'IN_APP'
    CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
  subject VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(40) NOT NULL DEFAULT 'ALL_STUDENTS',
  recipient_count INT NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES users(user_id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  v_tenant UUID;
  v_session UUID;
  v_window UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT session_id INTO v_session
  FROM exam_sessions WHERE tenant_id = v_tenant AND status = 'ACTIVE' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM exam_form_windows WHERE tenant_id = v_tenant LIMIT 1) THEN
    INSERT INTO exam_form_windows (
      tenant_id, session_id, title, semester, program_label,
      opens_at, closes_at, status
    ) VALUES (
      v_tenant, v_session,
      'B.Tech Sem 4 End Semester Form Fill-up',
      4, 'B.Tech',
      NOW() - INTERVAL '7 days',
      NOW() + INTERVAL '14 days',
      'OPEN'
    ) RETURNING window_id INTO v_window;
  END IF;
END $$;
