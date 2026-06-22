-- Ph.D. lifecycle: admission → registration → progress → synopsis → thesis → viva → award.

INSERT INTO roles (role_name, description) VALUES
  ('DRC_MEMBER', 'Departmental Research Committee — PET scrutiny, interview, supervisor allocation'),
  ('RAC_MEMBER', 'Research Advisory Committee — guide allocation, progress & synopsis review'),
  ('RRC_MEMBER', 'Research Review Committee — synopsis/thesis format, viva coordination'),
  ('PHD_ADJUDICATOR', 'External adjudicator — synopsis acceptance & thesis evaluation')
ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS phd_candidates (
  candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  applicant_name VARCHAR(200),
  applicant_email VARCHAR(200),
  application_type VARCHAR(20) NOT NULL DEFAULT 'PET'
    CHECK (application_type IN ('PET', 'PET_EXEMPTION')),
  proposed_topic TEXT NOT NULL,
  dept_id INT REFERENCES departments(dept_id),
  guide_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  lifecycle_stage VARCHAR(24) NOT NULL DEFAULT 'ADMISSION'
    CHECK (lifecycle_stage IN ('ADMISSION', 'REGISTRATION', 'PROGRESS', 'SYNOPSIS', 'THESIS', 'VIVA', 'AWARD', 'CLOSED')),
  lifecycle_status VARCHAR(48) NOT NULL DEFAULT 'APPLICATION_SUBMITTED',
  pending_actor_role VARCHAR(24),
  semester_count INT NOT NULL DEFAULT 0,
  fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
  documents_verified BOOLEAN NOT NULL DEFAULT FALSE,
  admission_certificate_issued BOOLEAN NOT NULL DEFAULT FALSE,
  guide_certificate_issued BOOLEAN NOT NULL DEFAULT FALSE,
  registration_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  re_viva_due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phd_candidates_tenant_status
  ON phd_candidates(tenant_id, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phd_candidates_user
  ON phd_candidates(tenant_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phd_candidates_guide
  ON phd_candidates(tenant_id, guide_user_id)
  WHERE guide_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phd_candidates_pending_role
  ON phd_candidates(tenant_id, pending_actor_role, lifecycle_status)
  WHERE pending_actor_role IS NOT NULL;

CREATE TABLE IF NOT EXISTS phd_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES phd_candidates(candidate_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  submission_type VARCHAR(32) NOT NULL
    CHECK (submission_type IN (
      'GUIDE_ACCEPTANCE', 'ELIGIBILITY', 'COURSEWORK', 'PROGRESS_REPORT',
      'SYNOPSIS', 'THESIS_DRAFT', 'THESIS_FINAL'
    )),
  semester INT,
  document_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewer_user_id UUID REFERENCES users(user_id),
  reviewer_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_phd_submissions_candidate
  ON phd_submissions(candidate_id, submission_type, created_at DESC);

CREATE TABLE IF NOT EXISTS phd_committee_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES phd_candidates(candidate_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  committee_type VARCHAR(16) NOT NULL
    CHECK (committee_type IN ('DRC', 'RAC', 'RRC', 'ADJUDICATOR', 'BOM')),
  decision VARCHAR(24) NOT NULL
    CHECK (decision IN (
      'RECOMMEND', 'REJECT', 'SHORTLIST', 'QUALIFY', 'FAIL',
      'APPROVE', 'RESUBMIT', 'RECOMMEND_SYNOPSIS', 'RECOMMEND_DEGREE'
    )),
  remarks TEXT,
  decided_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phd_committee_decisions_candidate
  ON phd_committee_decisions(candidate_id, committee_type, created_at DESC);
