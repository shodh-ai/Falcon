-- Clubs & chapters directory with student membership applications

ALTER TABLE campus_clubs
  ADD COLUMN IF NOT EXISTS club_type VARCHAR(20) NOT NULL DEFAULT 'CLUB',
  ADD COLUMN IF NOT EXISTS applications_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS focus_area VARCHAR(255);

CREATE TABLE IF NOT EXISTS campus_club_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES campus_clubs(club_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  motivation TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_club_applications_student
  ON campus_club_applications(tenant_id, student_user_id, status);

CREATE INDEX IF NOT EXISTS idx_campus_clubs_type
  ON campus_clubs(tenant_id, club_type);

UPDATE campus_clubs SET club_type = 'CLUB', applications_open = true WHERE club_type IS NULL OR club_type = '';

-- Demo chapters (SGVU)
INSERT INTO campus_clubs (tenant_id, name, description, club_type, applications_open, focus_area, faculty_advisor_id)
SELECT t.tenant_id,
  'IEEE Student Chapter',
  'Technical talks, hackathons, and industry connect for engineering students.',
  'CHAPTER',
  true,
  'Engineering & Technology',
  fa.user_id
FROM tenants t
LEFT JOIN users fa ON fa.tenant_id = t.tenant_id AND lower(fa.official_email) = 'faculty1@mygyanvihar.com'
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM campus_clubs c WHERE c.tenant_id = t.tenant_id AND c.name = 'IEEE Student Chapter'
  );

INSERT INTO campus_clubs (tenant_id, name, description, club_type, applications_open, focus_area)
SELECT t.tenant_id,
  'NSS Unit',
  'National Service Scheme — community outreach, blood drives, and rural camps.',
  'CHAPTER',
  true,
  'Community Service'
FROM tenants t
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM campus_clubs c WHERE c.tenant_id = t.tenant_id AND c.name = 'NSS Unit'
  );

INSERT INTO campus_clubs (tenant_id, name, description, club_type, applications_open, focus_area)
SELECT t.tenant_id,
  'NCC Army Wing',
  'Drill, discipline, and leadership development through the National Cadet Corps.',
  'CHAPTER',
  true,
  'Leadership & Defence'
FROM tenants t
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM campus_clubs c WHERE c.tenant_id = t.tenant_id AND c.name = 'NCC Army Wing'
  );

UPDATE campus_clubs SET applications_open = true WHERE tenant_id IN (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu');
