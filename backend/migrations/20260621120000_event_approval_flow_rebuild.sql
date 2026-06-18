-- Event approval flow: Student coordinator -> Faculty coordinator -> HOD -> Dean -> Accountant (funds) -> LIVE

ALTER TABLE campus_events
  ADD COLUMN IF NOT EXISTS guest_speakers TEXT,
  ADD COLUMN IF NOT EXISTS venue_id UUID,
  ADD COLUMN IF NOT EXISTS advisor_approval VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS estate_approval VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS finance_approval VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS finance_ledger_code VARCHAR(40) DEFAULT 'EVENTS_CLUB',
  ADD COLUMN IF NOT EXISTS hod_approval VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS dean_approval VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS funds_needed DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fund_transfer_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS fund_transfer_ref VARCHAR(120),
  ADD COLUMN IF NOT EXISTS fund_transferred_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fund_transferred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hod_approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hod_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dean_approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dean_approved_at TIMESTAMPTZ;

-- Backfill completed events
UPDATE campus_events
SET hod_approval = 'APPROVED',
    dean_approval = 'APPROVED',
    advisor_approval = COALESCE(advisor_approval, 'APPROVED'),
    estate_approval = COALESCE(estate_approval, 'NOT_REQUIRED'),
    finance_approval = COALESCE(finance_approval, 'NOT_REQUIRED')
WHERE status = 'LIVE';

-- Migrate in-flight estate-tier rows to HOD tier
UPDATE campus_events
SET status = 'PENDING_HOD',
    hod_approval = 'PENDING',
    dean_approval = 'PENDING',
    estate_approval = 'NOT_REQUIRED'
WHERE status = 'PENDING_ESTATE'
  AND COALESCE(advisor_approval, 'PENDING') = 'APPROVED';

-- Demo personas: student1 coordinator + faculty2 advisor on Robotics Club
DO $$
DECLARE
  v_tenant UUID;
  v_student UUID;
  v_faculty2 UUID;
  v_role INT;
  v_dept INT;
  pwd TEXT := '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT user_id INTO v_student FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'student1@mygyanvihar.com' LIMIT 1;

  SELECT user_id INTO v_faculty2 FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com' LIMIT 1;

  IF v_faculty2 IS NULL THEN
    SELECT dept_id INTO v_dept FROM departments WHERE dept_name = 'Computer Science' LIMIT 1;
    SELECT role_id INTO v_role FROM roles WHERE role_name = 'Faculty' LIMIT 1;

    INSERT INTO users (
      user_id, tenant_id, name, official_email, password_hash, role_id, dept_id, is_active, onboarding_status
    ) VALUES (
      'b000000e-0000-4000-8000-00000000000e'::uuid,
      v_tenant,
      'Faculty Two',
      'faculty2@mygyanvihar.com',
      pwd,
      v_role,
      v_dept,
      true,
      'ACTIVE'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      official_email = EXCLUDED.official_email,
      password_hash = EXCLUDED.password_hash,
      role_id = EXCLUDED.role_id,
      dept_id = EXCLUDED.dept_id,
      is_active = true,
      onboarding_status = 'ACTIVE';

    SELECT user_id INTO v_faculty2 FROM users
    WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com' LIMIT 1;
  END IF;

  UPDATE campus_clubs
  SET student_coordinator_id = v_student,
      faculty_advisor_id = COALESCE(v_faculty2, (
        SELECT user_id FROM users
        WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com'
        LIMIT 1
      ))
  WHERE tenant_id = v_tenant
    AND name = 'Robotics Club'
    AND v_student IS NOT NULL;
END $$;
