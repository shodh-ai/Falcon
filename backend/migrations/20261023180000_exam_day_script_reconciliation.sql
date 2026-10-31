-- Exam-day physical receipts and discrepancies. Never infer collection from
-- existing lifecycle statuses, attendance, marks, or historical records.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_day_schedule_tenant
  ON exam_schedules(exam_schedule_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_day_user_tenant
  ON users(user_id, tenant_id);

ALTER TABLE answer_sheet_tracking
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collected_by UUID;
CREATE INDEX IF NOT EXISTS idx_exam_day_sheet_candidate
  ON answer_sheet_tracking(tenant_id, exam_schedule_id, student_user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='answer_sheet_tracking'::regclass AND conname='ck_exam_day_collection') THEN
    ALTER TABLE answer_sheet_tracking ADD CONSTRAINT ck_exam_day_collection CHECK (
      (collected_at IS NULL AND collected_by IS NULL) OR
      (collected_at IS NOT NULL AND collected_by IS NOT NULL AND
       exam_schedule_id IS NOT NULL AND student_user_id IS NOT NULL AND status <> 'ISSUED')
    );
  END IF;
  -- NOT VALID preserves ambiguous legacy links. PostgreSQL still checks every
  -- new/changed relationship; service reads independently enforce tenant scope.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='answer_sheet_tracking'::regclass AND conname='fk_exam_day_sheet_schedule') THEN
    ALTER TABLE answer_sheet_tracking ADD CONSTRAINT fk_exam_day_sheet_schedule
      FOREIGN KEY(exam_schedule_id, tenant_id) REFERENCES exam_schedules(exam_schedule_id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='answer_sheet_tracking'::regclass AND conname='fk_exam_day_sheet_student') THEN
    ALTER TABLE answer_sheet_tracking ADD CONSTRAINT fk_exam_day_sheet_student
      FOREIGN KEY(student_user_id, tenant_id) REFERENCES users(user_id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='answer_sheet_tracking'::regclass AND conname='fk_exam_day_sheet_collector') THEN
    ALTER TABLE answer_sheet_tracking ADD CONSTRAINT fk_exam_day_sheet_collector
      FOREIGN KEY(collected_by, tenant_id) REFERENCES users(user_id, tenant_id);
  END IF;
END $$;

-- A missing candidate script is an exception, not a fabricated received booklet.
-- Reopening/resolution history is retained in the existing exam_audit_logs.
CREATE TABLE IF NOT EXISTS exam_script_discrepancies (
  discrepancy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  exam_schedule_id UUID NOT NULL,
  student_user_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'MISSING' CHECK(status IN ('MISSING','RESOLVED')),
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 2000),
  reported_by UUID NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolution VARCHAR(24) CHECK(resolution IN ('FOUND','REPORTED_IN_ERROR')),
  resolution_reason TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  UNIQUE(tenant_id, exam_schedule_id, student_user_id),
  FOREIGN KEY(exam_schedule_id, tenant_id) REFERENCES exam_schedules(exam_schedule_id, tenant_id),
  FOREIGN KEY(student_user_id, tenant_id) REFERENCES users(user_id, tenant_id),
  FOREIGN KEY(reported_by, tenant_id) REFERENCES users(user_id, tenant_id),
  FOREIGN KEY(resolved_by, tenant_id) REFERENCES users(user_id, tenant_id),
  CONSTRAINT ck_exam_script_resolution CHECK (
    (status='MISSING' AND resolution IS NULL AND resolution_reason IS NULL AND resolved_by IS NULL AND resolved_at IS NULL) OR
    (status='RESOLVED' AND resolution IS NOT NULL AND resolution_reason IS NOT NULL AND length(btrim(resolution_reason)) BETWEEN 3 AND 2000 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_script_discrepancies'::regclass AND conname='ck_exam_script_resolution') THEN
    ALTER TABLE exam_script_discrepancies ADD CONSTRAINT ck_exam_script_resolution CHECK (
      (status='MISSING' AND resolution IS NULL AND resolution_reason IS NULL AND resolved_by IS NULL AND resolved_at IS NULL) OR
      (status='RESOLVED' AND resolution IS NOT NULL AND resolution_reason IS NOT NULL AND length(btrim(resolution_reason)) BETWEEN 3 AND 2000 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_exam_day_missing
  ON exam_script_discrepancies(tenant_id, exam_schedule_id, status);

-- Only new exam-day reports use this retry key. Existing cases and sanctions
-- remain unchanged; reporting an incident does not apply a marks penalty.
ALTER TABLE ufm_cases ADD COLUMN IF NOT EXISTS exam_day_reference UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_day_ufm_reference
  ON ufm_cases(tenant_id, exam_day_reference) WHERE exam_day_reference IS NOT NULL;
