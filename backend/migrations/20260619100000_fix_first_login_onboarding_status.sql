-- Align HR-created portal users with first-login onboarding wizard statuses.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS staff_onboarding_docs (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('AADHAAR', 'PAN', 'HIGHEST_DEGREE', 'PHOTO')),
  file_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_remarks TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_user_id, doc_type)
);

-- Expand onboarding_status constraint for wizard states (idempotent).
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_onboarding_status;
ALTER TABLE users
  ADD CONSTRAINT chk_users_onboarding_status
  CHECK (onboarding_status IN (
    'PENDING_ONBOARDING',
    'IN_PROGRESS',
    'ACTIVE',
    'EXITED',
    'PENDING_PASSWORD_RESET',
    'PENDING_DOCUMENTS',
    'PENDING_ADMIN_APPROVAL',
    'COMPLETED'
  ));

-- Existing student/faculty/HOD users stuck on legacy HR status → wizard step 1.
UPDATE users u
SET onboarding_status = 'PENDING_PASSWORD_RESET', updated_at = NOW()
FROM roles r
WHERE r.role_id = u.role_id
  AND u.onboarding_status IN ('PENDING_ONBOARDING', 'IN_PROGRESS')
  AND lower(r.role_name) IN ('student', 'applicant', 'faculty', 'hod', 'dean');

-- Entity access for employees created before access backfill.
UPDATE users u
SET entity_id = p.entity_id, updated_at = NOW()
FROM hr_employee_profiles p
WHERE p.user_id = u.user_id
  AND p.tenant_id = u.tenant_id
  AND p.entity_id IS NOT NULL
  AND u.entity_id IS NULL;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT p.user_id, p.entity_id
FROM hr_employee_profiles p
WHERE p.entity_id IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;
