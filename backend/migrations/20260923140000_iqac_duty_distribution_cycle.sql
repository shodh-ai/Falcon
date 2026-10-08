-- IQAC duty distribution: tenant-scoped recurring cycles, evidence review and
-- exact month-end deadlines. Existing records remain readable and are assigned
-- to the canonical tenant for backward compatibility.

ALTER TABLE task_master
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dept_id INTEGER REFERENCES departments(dept_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_label VARCHAR(160),
  ADD COLUMN IF NOT EXISTS default_assignee_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20),
  ADD COLUMN IF NOT EXISTS due_date_policy VARCHAR(32) NOT NULL DEFAULT 'MONTH_END',
  ADD COLUMN IF NOT EXISTS evidence_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_module VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source_reference TEXT,
  ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE task_master
SET tenant_id = 'a0000000-0000-4000-8000-000000000001'::uuid
WHERE tenant_id IS NULL;

ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dept_id INTEGER REFERENCES departments(dept_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_year INTEGER,
  ADD COLUMN IF NOT EXISTS cycle_month SMALLINT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_comments TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE task_assignments a
SET tenant_id = COALESCE(u.tenant_id, tm.tenant_id),
    dept_id = u.dept_id,
    cycle_year = COALESCE(EXTRACT(YEAR FROM a.due_date)::int, EXTRACT(YEAR FROM a.assigned_at)::int),
    cycle_month = COALESCE(EXTRACT(MONTH FROM a.due_date)::int, EXTRACT(MONTH FROM a.assigned_at)::int),
    submitted_at = CASE WHEN UPPER(a.status) IN ('COMPLETED', 'SUBMITTED') THEN a.completed_at END
FROM users u, task_master tm
WHERE a.assigned_to = u.user_id
  AND a.task_id = tm.task_id
  AND (a.tenant_id IS NULL OR a.cycle_year IS NULL OR a.cycle_month IS NULL);

UPDATE task_assignments SET status = UPPER(status);
UPDATE task_assignments SET status = 'ACCEPTED' WHERE status = 'COMPLETED';

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(32) NOT NULL DEFAULT 'SUPPORTING_DOCUMENT',
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

UPDATE submissions s
SET tenant_id = a.tenant_id
FROM task_assignments a
WHERE s.assignment_id = a.assignment_id AND s.tenant_id IS NULL;

DO $$ BEGIN
  ALTER TABLE task_master ADD CONSTRAINT chk_task_due_date_policy
    CHECK (due_date_policy IN ('MONTH_END', 'DAY_25'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task_master ADD CONSTRAINT chk_task_evidence_requirements_array
    CHECK (jsonb_typeof(evidence_requirements) = 'array');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task_master ADD CONSTRAINT chk_task_source_hash
    CHECK (source_hash IS NULL OR source_hash ~ '^[0-9a-fA-F]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task_assignments ADD CONSTRAINT chk_task_assignment_cycle_month
    CHECK (cycle_month BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE task_assignments ADD CONSTRAINT chk_task_assignment_status
    CHECK (status IN ('DRAFT','PUBLISHED','OPEN','PENDING','SUBMITTED','UNDER_REVIEW','ACCEPTED','CHANGES_REQUESTED','OVERDUE','WAIVED','CLOSED','CANCELLED')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT chk_submission_content_hash
    CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-fA-F]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_task_master_tenant_cycle
  ON task_master (tenant_id, academic_year, month) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_assignments_tenant_cycle
  ON task_assignments (tenant_id, cycle_year, cycle_month, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignment_cycle
  ON task_assignments (tenant_id, task_id, assigned_to, cycle_year, cycle_month)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_tenant_assignment
  ON submissions (tenant_id, assignment_id, uploaded_at DESC) WHERE deleted_at IS NULL;

COMMENT ON COLUMN task_assignments.status IS
  'Evidence upload reaches SUBMITTED; only independent review reaches ACCEPTED/CLOSED.';
COMMENT ON COLUMN task_assignments.cycle_year IS
  'Separates recurring assignments across calendar years.';
