-- Student Portal Polish: profile unlock, CBCS course_type, documents vault, helpdesk rejection

-- 1. Profile unlock buffer (15-min edit window after admin approval)
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS profile_unlocked_until TIMESTAMPTZ NULL;

-- 2. CBCS course type (CORE vs ELECTIVE)
ALTER TABLE academic_courses
  ADD COLUMN IF NOT EXISTS course_type VARCHAR(20) DEFAULT 'CORE';

UPDATE academic_courses
SET course_type = CASE WHEN is_elective = true THEN 'ELECTIVE' ELSE 'CORE' END
WHERE course_type IS NULL OR course_type = 'CORE' AND is_elective = true;

-- 3. Student document vault (fee receipts, etc.)
CREATE TABLE IF NOT EXISTS student_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_url TEXT NOT NULL,
  source_transaction_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_documents_user
  ON student_documents (student_user_id, category);

-- 4. Helpdesk rejection reason + REJECTED status
ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

ALTER TABLE helpdesk_tickets DROP CONSTRAINT IF EXISTS helpdesk_tickets_status_check;
ALTER TABLE helpdesk_tickets
  ADD CONSTRAINT helpdesk_tickets_status_check
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'));

-- 5. Transport route change requests
CREATE TABLE IF NOT EXISTS transport_route_change_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  current_route_id UUID NULL,
  current_stop_id UUID NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_route_change_student
  ON transport_route_change_requests (student_user_id, status);

-- 6. Global hostel sale toggle (tenant settings JSONB)
UPDATE tenants
SET settings = COALESCE(settings, '{}'::jsonb) || '{"is_hostel_sale_active": false}'::jsonb
WHERE settings IS NULL OR settings->>'is_hostel_sale_active' IS NULL;
