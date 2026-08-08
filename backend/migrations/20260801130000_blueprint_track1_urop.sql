-- Track 1: UROP — elite waiver, IP, Wrangler, Hacker Filter, Product Viva

ALTER TABLE student_attendance_exemptions
  DROP CONSTRAINT IF EXISTS student_attendance_exemptions_reason_category_check;
ALTER TABLE student_attendance_exemptions
  ADD CONSTRAINT student_attendance_exemptions_reason_category_check
  CHECK (reason_category IN (
    'MEDICAL', 'ACCIDENT', 'INTERNSHIP', 'BEREAVEMENT', 'OTHER', 'ELITE_FELLOW'
  ));

CREATE TABLE IF NOT EXISTS ecell_ip_agreements (
  agreement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES ecell_projects(project_id) ON DELETE CASCADE,
  lead_inventor_user_id UUID NOT NULL REFERENCES users(user_id),
  university_equity_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
  sgvu_pays_legal_fees BOOLEAN NOT NULL DEFAULT true,
  reversion_years INT NOT NULL DEFAULT 3,
  reversion_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SIGNED', 'REVERTED')),
  signed_doc_url TEXT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_id)
);

CREATE TABLE IF NOT EXISTS ecell_mentor_profiles (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mentor_tier VARCHAR(20) NOT NULL DEFAULT 'CAMPUS'
    CHECK (mentor_tier IN ('CAMPUS', 'ALUMNI', 'WRANGLER')),
  org TEXT,
  is_industry_lead BOOLEAN NOT NULL DEFAULT false,
  expertise_label TEXT,
  github_focus BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS ecell_fellowship_trials (
  trial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  program_code VARCHAR(40) NOT NULL DEFAULT 'HACKER_FILTER',
  linked_project_id UUID REFERENCES ecell_projects(project_id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  status VARCHAR(20) NOT NULL DEFAULT 'TRIAL'
    CHECK (status IN ('TRIAL', 'PASSED', 'FAILED', 'CONVERTED')),
  paid_stipend_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  decided_by UUID REFERENCES users(user_id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_viva_panelists (
  panelist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  course_offering_id TEXT,
  user_id UUID NOT NULL REFERENCES users(user_id),
  panel_role VARCHAR(20) NOT NULL
    CHECK (panel_role IN ('VC', 'INDUSTRY', 'SHODH', 'FACULTY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ecell_mentor_meetings
  ADD COLUMN IF NOT EXISTS github_commits_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cad_updates_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sprint_notes TEXT;

ALTER TABLE academic_marks DROP CONSTRAINT IF EXISTS academic_marks_exam_type_check;
ALTER TABLE academic_marks ADD CONSTRAINT academic_marks_exam_type_check
  CHECK (exam_type IN (
    'CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT', 'DA1', 'DA2',
    'WT1', 'WT2', 'GA1', 'GA2',
    'MTE1', 'MTE2', 'MT1', 'MT2', 'ETE',
    'PE1', 'PE2', 'PE3', 'PE4', 'PE5', 'PE6', 'PE7', 'PE8', 'PE9', 'PE10',
    'PROJECT_TITLE', 'PROJECT_PRESENTATION_1', 'PROJECT_PRESENTATION_2',
    'LAB_VIVA', 'PRODUCT_VIVA', 'MINOR_PRACTICAL', 'MAJOR_PRACTICAL'
  ));

CREATE INDEX IF NOT EXISTS idx_ecell_fellowship_trials_student
  ON ecell_fellowship_trials(tenant_id, student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ecell_ip_agreements_project
  ON ecell_ip_agreements(tenant_id, project_id, status);
