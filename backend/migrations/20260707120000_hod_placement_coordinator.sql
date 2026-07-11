-- HOD department placement coordinator + drive registration

CREATE TABLE IF NOT EXISTS hod_dept_placement_settings (
  tenant_id UUID NOT NULL,
  dept_id INT NOT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
  coordinator_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, dept_id)
);

CREATE TABLE IF NOT EXISTS hod_dept_placement_drives (
  drive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  dept_id INT NOT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
  company_name VARCHAR(255) NOT NULL,
  job_role VARCHAR(255),
  drive_date DATE,
  drive_time TIME,
  semester INT,
  form_url TEXT,
  form_type VARCHAR(30) NOT NULL DEFAULT 'INTERNAL',
  status VARCHAR(30) NOT NULL DEFAULT 'UPCOMING',
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hod_placement_drives_dept
  ON hod_dept_placement_drives (tenant_id, dept_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS hod_dept_placement_responses (
  response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL REFERENCES hod_dept_placement_drives(drive_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  student_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  student_name VARCHAR(255) NOT NULL,
  student_email VARCHAR(255),
  enrollment_no VARCHAR(100),
  phone VARCHAR(50),
  response_json JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hod_placement_responses_drive
  ON hod_dept_placement_responses (drive_id, submitted_at DESC);
