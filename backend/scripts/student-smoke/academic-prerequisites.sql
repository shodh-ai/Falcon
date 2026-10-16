-- Approved additive prerequisites only; original practical-roster definitions.
CREATE TABLE IF NOT EXISTS academic_practical_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_id UUID NOT NULL REFERENCES academic_courses(course_id),
  section_code VARCHAR(50) NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by UUID NOT NULL REFERENCES users(user_id),
  updated_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_practical_batch_scope_unique UNIQUE (tenant_id, course_id, section_code),
  CONSTRAINT academic_practical_batch_identity_unique UNIQUE (batch_id, tenant_id, course_id)
);
CREATE TABLE IF NOT EXISTS academic_practical_batch_members (
  membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  course_id UUID NOT NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  changed_by UUID NOT NULL REFERENCES users(user_id),
  CONSTRAINT academic_practical_member_batch_fk FOREIGN KEY (batch_id, tenant_id, course_id)
    REFERENCES academic_practical_batches(batch_id, tenant_id, course_id),
  CONSTRAINT academic_practical_member_interval CHECK (removed_at IS NULL OR removed_at >= assigned_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_practical_member_one_active_batch
  ON academic_practical_batch_members (tenant_id, course_id, student_user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS academic_practical_member_batch_active
  ON academic_practical_batch_members (batch_id, student_user_id) WHERE removed_at IS NULL;
-- Original result control schema uniqueness, absent from the existing tables.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='exam_result_sessions'::regclass AND conname='exam_result_sessions_scope_unique') THEN
    ALTER TABLE exam_result_sessions ADD CONSTRAINT exam_result_sessions_scope_unique UNIQUE (tenant_id,course_id,exam_type,semester);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='student_exam_reports'::regclass AND conname='student_exam_reports_session_student_unique') THEN
    ALTER TABLE student_exam_reports ADD CONSTRAINT student_exam_reports_session_student_unique UNIQUE (session_id,student_user_id);
  END IF;
END $$;
