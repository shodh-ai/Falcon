-- Placement ATS foundation: pipeline stages, resume vault, placement lock, IQAC bridge

DO $$
DECLARE
  drives_table TEXT := 'placement_drives';
  apps_table TEXT := 'placement_drive_applications';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'placement_drives'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'placement_ats_drives'
  ) THEN
    drives_table := 'placement_ats_drives';
    apps_table := 'placement_ats_drive_applications';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = drives_table) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description TEXT', drives_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ', drives_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS job_role VARCHAR(255)', drives_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS package_lpa NUMERIC(5,2)', drives_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS max_active_backlogs INT NOT NULL DEFAULT 0', drives_table);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = drives_table AND column_name = 'job_profile'
    ) THEN
      EXECUTE format(
        'UPDATE %I SET job_role = job_profile WHERE job_role IS NULL AND job_profile IS NOT NULL',
        drives_table
      );
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = drives_table AND column_name = 'package_details_lpa'
    ) THEN
      EXECUTE format(
        'UPDATE %I SET package_lpa = package_details_lpa WHERE package_lpa IS NULL AND package_details_lpa IS NOT NULL',
        drives_table
      );
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = drives_table AND column_name = 'max_backlogs'
    ) THEN
      EXECUTE format(
        'UPDATE %I SET max_active_backlogs = max_backlogs WHERE max_active_backlogs = 0 AND max_backlogs IS NOT NULL AND max_backlogs > 0',
        drives_table
      );
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = drives_table AND column_name = 'drive_date'
    ) THEN
      EXECUTE format(
        'UPDATE %I SET deadline = (drive_date::timestamptz + interval ''23 hours 59 minutes'') WHERE deadline IS NULL AND drive_date IS NOT NULL',
        drives_table
      );
    END IF;
    EXECUTE format('UPDATE %I SET status = ''ACTIVE'' WHERE status IN (''OPEN'', ''open'')', drives_table);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = apps_table) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) NOT NULL DEFAULT ''APPLIED''', apps_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS resume_file_path TEXT', apps_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cgpa_at_apply NUMERIC(4,2)', apps_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS active_backlogs_at_apply INT NOT NULL DEFAULT 0', apps_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS rejected_at_stage VARCHAR(50)', apps_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', apps_table);
    EXECUTE format('UPDATE %I SET pipeline_stage = %L WHERE pipeline_stage IS NULL', apps_table, 'APPLIED');
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_placement_drive_apps_stage ON %I(drive_id, pipeline_stage)',
      apps_table
    );
  END IF;
END $$;

-- Student placement lock
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS is_placement_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS placement_offer_lpa NUMERIC(5,2);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS placement_lock_reason TEXT;

-- IQAC bridge tables
CREATE TABLE IF NOT EXISTS placement_job_postings (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(200) NOT NULL,
  role_title VARCHAR(200) NOT NULL,
  description TEXT,
  ctc_lpa NUMERIC(12,2),
  location VARCHAR(200),
  eligibility JSONB,
  one_student_one_job BOOLEAN NOT NULL DEFAULT TRUE,
  apply_deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  drive_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_job_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES placement_job_postings(job_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'APPLIED',
  responses JSONB,
  drive_application_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, student_user_id)
);

ALTER TABLE placement_job_postings ADD COLUMN IF NOT EXISTS drive_id UUID;
ALTER TABLE placement_job_applications ADD COLUMN IF NOT EXISTS drive_application_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'placement_drives' AND column_name = 'tenant_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_placement_drives_active ON placement_drives(tenant_id, status, deadline);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_placement_job_postings_drive ON placement_job_postings(drive_id);
