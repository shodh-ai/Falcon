-- Student safety concerns: ragging and sexual harassment grievances.
-- Routed to DC / HOD / Dean / HR / Warden based on concern type and accused party.

CREATE TABLE IF NOT EXISTS student_safety_concerns (
  concern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  concern_type VARCHAR(24) NOT NULL
    CHECK (concern_type IN ('RAGGING', 'SEXUAL_HARASSMENT')),
  accused_type VARCHAR(16) NOT NULL
    CHECK (accused_type IN ('FACULTY', 'STUDENT', 'SENIOR', 'STAFF', 'OTHER')),
  accused_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  accused_description TEXT,
  incident_description TEXT NOT NULL,
  incident_location TEXT,
  incident_date DATE,
  is_hostel_related BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED')),
  routed_to_roles TEXT[] NOT NULL DEFAULT '{}',
  reviewer_user_id UUID REFERENCES users(user_id),
  reviewer_remarks TEXT,
  resolution_summary TEXT,
  accused_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_safety_concerns_reporter
  ON student_safety_concerns(tenant_id, reporter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_safety_concerns_status
  ON student_safety_concerns(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_safety_concerns_accused
  ON student_safety_concerns(tenant_id, accused_user_id, created_at DESC)
  WHERE accused_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_safety_concerns_roles
  ON student_safety_concerns USING GIN (routed_to_roles);
