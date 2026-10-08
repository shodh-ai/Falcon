-- Track 5: MIT-Killer College

CREATE TABLE IF NOT EXISTS special_programs (
  program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS special_program_enrollments (
  enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES special_programs(program_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'ENROLLED'
    CHECK (status IN ('ENROLLED','ACTIVE','COMPLETED','WITHDRAWN')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pop_profiles (
  pop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT,
  bio TEXT,
  equity_incentive_pct NUMERIC(5,2) NOT NULL DEFAULT 1.5,
  linked_ecell_project_ids UUID[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS portfolio_transcript_artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  artifact_type VARCHAR(32) NOT NULL
    CHECK (artifact_type IN ('GITHUB_REPO','PATENT','HARDWARE_BUILD','MOONSHOT','LAB_BUILD')),
  title TEXT NOT NULL,
  url TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_transcripts (
  transcript_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  mode VARCHAR(20) NOT NULL DEFAULT 'PORTFOLIO'
    CHECK (mode IN ('PORTFOLIO','GPA_ONLY','HYBRID')),
  published_at TIMESTAMPTZ,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admissions_pathway_flags (
  flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  lead_id UUID,
  email TEXT,
  pathway VARCHAR(40) NOT NULL DEFAULT 'HS_DIRECT',
  bypass_jee BOOLEAN NOT NULL DEFAULT true,
  grade_level TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hr_job_postings ADD COLUMN IF NOT EXISTS track_code VARCHAR(40);

DO $$
DECLARE tid UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN SELECT tenant_id INTO tid FROM tenants LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;

  INSERT INTO special_programs (tenant_id, code, name, description) VALUES
    (tid, 'WETWARE_BIOTECH', 'First-Principles Biotech (Wetware)',
     'BSL-1 BioBricks, protein invention with Shodh AI, robotic bio-foundries'),
    (tid, 'PORTFOLIO_DEGREE', 'Portfolio Degree',
     'Graduate on GitHub repos, patents, and hardware builds'),
    (tid, 'HS_DIRECT', 'High-School Interception',
     'Direct admission for 11th/12th hackers bypassing JEE')
  ON CONFLICT (tenant_id, code) DO NOTHING;
END $$;
