-- Master Requirements final sweep: placement drives, admin events, timetable, policy vault, permissions

-- Placement drives (ATS eligibility)
CREATE TABLE IF NOT EXISTS placement_drives (
  drive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES placement_companies(company_id) ON DELETE CASCADE,
  job_profile VARCHAR(255) NOT NULL,
  package_details_lpa NUMERIC(5,2) NULL,
  min_cgpa NUMERIC(3,2) NOT NULL DEFAULT 6.00,
  max_backlogs INT NOT NULL DEFAULT 0,
  drive_date DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS placement_drive_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  drive_id UUID NOT NULL REFERENCES placement_drives(drive_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  eligibility_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (drive_id, student_user_id)
);

ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS hr_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS industry VARCHAR(100) NULL;
ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS company_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Admin ops: events & master timetable
CREATE TABLE IF NOT EXISTS admin_campus_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  venue VARCHAR(120) NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ NOT NULL,
  budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  guest_pass_code VARCHAR(40) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_timetable_slots (
  slot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  room_code VARCHAR(50) NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  course_code VARCHAR(40) NULL,
  faculty_user_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
  academic_year VARCHAR(12) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, room_code, day_of_week, start_time, academic_year)
);

CREATE TABLE IF NOT EXISTS admin_transport_zones (
  zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  zone_name VARCHAR(120) NOT NULL,
  annual_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  UNIQUE (tenant_id, zone_name)
);

ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS capacity INT NULL;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS route_details TEXT NULL;

-- Global policy vault
CREATE TABLE IF NOT EXISTS global_policy_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  folder VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  file_url TEXT NULL,
  is_read_only BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skill mapping & training calendar
CREATE TABLE IF NOT EXISTS placement_skill_matrix (
  matrix_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_name VARCHAR(120) NOT NULL,
  proficiency_level INT NOT NULL DEFAULT 1 CHECK (proficiency_level BETWEEN 1 AND 5),
  industry_required BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, student_user_id, skill_name)
);

CREATE TABLE IF NOT EXISTS placement_training_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  session_date TIMESTAMPTZ NOT NULL,
  trainer_name VARCHAR(120) NULL,
  capacity INT NOT NULL DEFAULT 50
);

-- View alias: admin_assets maps to university_assets
CREATE OR REPLACE VIEW admin_assets AS
SELECT asset_id,
       asset_tag,
       asset_type AS category,
       name,
       assigned_user_id AS assigned_to_user,
       assigned_room,
       status,
       tenant_id,
       created_at
FROM university_assets;

CREATE OR REPLACE VIEW admin_fleet AS
SELECT vehicle_id,
       registration_no,
       capacity,
       driver_user_id,
       COALESCE(route_details, route_zone) AS route_details,
       tenant_id,
       status
FROM fleet_vehicles;

INSERT INTO global_policy_documents (tenant_id, folder, title, file_url)
SELECT t.tenant_id, v.folder, v.title, v.url
FROM public.tenants t
CROSS JOIN (VALUES
  ('Ordinances', 'University Ordinances 2024', '/documents/ordinances.pdf'),
  ('NEP Rules', 'NEP 2020 Implementation Guidelines', '/documents/nep.pdf'),
  ('Evaluation Policies', 'Evaluation & Grading Policy', '/documents/evaluation.pdf'),
  ('HR Policies', 'Faculty Recruitment Policy', '/documents/hr-policy.pdf'),
  ('Procurement Rules', 'Purchase & Procurement Manual', '/documents/procurement.pdf'),
  ('Blank Formats', 'Bonafide Certificate Format', '/documents/bonafide-template.pdf')
) AS v(folder, title, url)
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (
    SELECT 1 FROM global_policy_documents g WHERE g.tenant_id = t.tenant_id AND g.title = v.title
  );

INSERT INTO parent_student_links (tenant_id, parent_name, parent_mobile, student_user_id, relation)
SELECT t.tenant_id, 'Demo Parent', '+919999000001', u.user_id, 'Father'
FROM public.tenants t
JOIN users u ON u.tenant_id = t.tenant_id
JOIN roles r ON r.role_id = u.role_id AND r.role_name = 'Student'
WHERE t.subdomain = 'sgvu'
LIMIT 1
ON CONFLICT DO NOTHING;
