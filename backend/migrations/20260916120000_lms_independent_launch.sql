-- LMS independent-launch control plane and data-integrity hardening.

INSERT INTO platform_module_catalog(module_key,display_name,catalogue_version,definition)
VALUES('lms_learning','Learning Management System','1.0.0','{"owner":"academics","independent_launch":true}'::jsonb)
ON CONFLICT(module_key) DO UPDATE
SET display_name=EXCLUDED.display_name,
    catalogue_version=EXCLUDED.catalogue_version,
    definition=platform_module_catalog.definition || EXCLUDED.definition,
    updated_at=NOW();

-- Preserve existing behavior during expansion. New tenants still default to OFF.
INSERT INTO platform_module_states(module_key,tenant_id,scope_type,state,reason)
SELECT 'lms_learning',t.tenant_id,'TENANT','ACTIVE','Existing LMS compatibility bootstrap'
FROM tenants t
ON CONFLICT (module_key,tenant_id,scope_type,scope_id) DO NOTHING;

-- Pharmacy is the first controlled LMS cohort. Keep it unavailable until the
-- department-scoped migration, storage, security and smoke evidence passes.
INSERT INTO platform_module_states(module_key,tenant_id,scope_type,scope_id,state,reason)
SELECT DISTINCT
  'lms_learning',u.tenant_id,'DEPARTMENT',d.dept_id::text,'OFF',
  'Pharmacy LMS requires department launch acceptance'
FROM departments d
JOIN users u ON u.dept_id=d.dept_id
WHERE d.deleted_at IS NULL
  AND lower(d.dept_name) LIKE '%pharmacy%'
ON CONFLICT (module_key,tenant_id,scope_type,scope_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_module_readiness_evidence (
  readiness_evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES platform_module_catalog(module_key),
  scope_type TEXT NOT NULL CHECK(scope_type IN('TENANT','CAMPUS','DEPARTMENT')),
  scope_id TEXT,
  check_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('PASS','FAIL')),
  evidence_hash CHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  recorded_by UUID NOT NULL REFERENCES users(user_id),
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK((scope_type='TENANT' AND scope_id IS NULL) OR (scope_type IN('CAMPUS','DEPARTMENT') AND scope_id IS NOT NULL)),
  UNIQUE(tenant_id,module_key,recorded_by,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_module_readiness_latest
  ON platform_module_readiness_evidence(tenant_id,module_key,scope_type,scope_id,check_key,checked_at DESC);

DELETE FROM lms_attempt_answers a
USING lms_attempt_answers duplicate
WHERE a.attempt_id=duplicate.attempt_id
  AND a.question_id=duplicate.question_id
  AND a.answer_id>duplicate.answer_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lms_attempt_answer_question
  ON lms_attempt_answers(attempt_id,question_id);
CREATE INDEX IF NOT EXISTS idx_lms_quiz_tenant_course
  ON lms_quizzes(tenant_id,course_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lms_thread_tenant_course
  ON lms_forum_threads(tenant_id,course_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lms_enrollment_scope
  ON student_course_enrollments(tenant_id,course_id,student_user_id,status);
CREATE INDEX IF NOT EXISTS idx_lms_faculty_allocation_scope
  ON academic_course_allocations(tenant_id,course_id,faculty_user_id,status);

INSERT INTO roles(role_name,description)
VALUES('LMSAdmin','LMS launch, migration and operational administrator')
ON CONFLICT(role_name) DO NOTHING;
