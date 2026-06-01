-- Seed 10 master QA personas with local auth (password123)
-- bcrypt hash generated once: password123

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Student') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Student', 'Application role for Student portal access');
  END IF;
END $$;

INSERT INTO departments (dept_name, description)
VALUES ('Computer Science', 'School of Computing & IT')
ON CONFLICT (dept_name) DO NOTHING;

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
dept AS (
  SELECT dept_id FROM departments WHERE dept_name = 'Computer Science' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_users AS (
  SELECT * FROM (VALUES
    ('b0000001-0000-4000-8000-000000000001'::uuid, 'Student One',   'student1@mygyanvihar.com',  'Student',      NULL::numeric, NULL::uuid),
    ('b0000002-0000-4000-8000-000000000002'::uuid, 'Student Two',   'student2@mygyanvihar.com',  'Student',      NULL::numeric, NULL::uuid),
    ('b0000003-0000-4000-8000-000000000003'::uuid, 'Faculty One',   'faculty1@mygyanvihar.com',  'Faculty',      65000.00,      'b0000004-0000-4000-8000-000000000004'::uuid),
    ('b0000004-0000-4000-8000-000000000004'::uuid, 'HOD CSE',       'hod@mygyanvihar.com',       'HOD',          95000.00,      NULL::uuid),
    ('b0000005-0000-4000-8000-000000000005'::uuid, 'HR Manager',    'hr@mygyanvihar.com',        'HR',           72000.00,      'b000000a-0000-4000-8000-00000000000a'::uuid),
    ('b0000006-0000-4000-8000-000000000006'::uuid, 'Hostel Warden', 'warden@mygyanvihar.com',    'Warden',       58000.00,      'b000000a-0000-4000-8000-00000000000a'::uuid),
    ('b0000007-0000-4000-8000-000000000007'::uuid, 'Finance Head',  'finance@mygyanvihar.com',   'Accountant',   78000.00,      'b000000a-0000-4000-8000-00000000000a'::uuid),
    ('b0000008-0000-4000-8000-000000000008'::uuid, 'IQAC Officer',  'iqac@mygyanvihar.com',      'IQAC',         68000.00,      'b000000a-0000-4000-8000-00000000000a'::uuid),
    ('b0000009-0000-4000-8000-000000000009'::uuid, 'Chief Librarian','library@mygyanvihar.com',  'Librarian',    55000.00,      'b000000a-0000-4000-8000-00000000000a'::uuid),
    ('b000000a-0000-4000-8000-00000000000a'::uuid, 'Vice Chancellor','president@mygyanvihar.com','President',    185000.00,     NULL::uuid)
  ) AS u(user_id, name, email, role_name, salary_base, reporting_officer_id)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, salary_base, reporting_officer_id, is_active
)
SELECT
  su.user_id,
  t.tenant_id,
  su.name,
  su.email,
  r.role_id,
  d.dept_id,
  p.hash,
  su.salary_base,
  su.reporting_officer_id,
  true
FROM seed_users su
CROSS JOIN tenant t
CROSS JOIN pwd p
LEFT JOIN roles r ON r.role_name = su.role_name
LEFT JOIN dept d ON su.role_name IN ('Student', 'Faculty', 'HOD')
WHERE r.role_id IS NOT NULL
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  salary_base = EXCLUDED.salary_base,
  reporting_officer_id = EXCLUDED.reporting_officer_id,
  is_active = true;

-- Mentorship: Student 1 proctored by Faculty 1
INSERT INTO academic_mentorships (student_user_id, proctor_user_id, is_active)
VALUES (
  'b0000001-0000-4000-8000-000000000001',
  'b0000003-0000-4000-8000-000000000003',
  true
)
ON CONFLICT (student_user_id) DO UPDATE SET
  proctor_user_id = EXCLUDED.proctor_user_id,
  is_active = true;

-- Leave balances for staff personas
INSERT INTO hr_leave_balances (user_id, leave_type, year, entitled, used)
SELECT u.user_id, lb.leave_type, 2026, lb.entitled, lb.used
FROM users u
CROSS JOIN (VALUES
  ('CL', 12.00, 1.00),
  ('SL', 10.00, 0.00),
  ('EL', 18.00, 0.00)
) AS lb(leave_type, entitled, used)
WHERE u.official_email IN (
  'faculty1@mygyanvihar.com', 'hod@mygyanvihar.com', 'hr@mygyanvihar.com'
)
ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
  entitled = EXCLUDED.entitled,
  used = EXCLUDED.used;

-- Demo attendance for Faculty 1 (current month weekdays)
INSERT INTO hr_staff_attendance (user_id, work_date, check_in_at, status, source)
SELECT
  'b0000003-0000-4000-8000-000000000003',
  d::date,
  d::timestamp + time '09:15',
  'PRESENT',
  'WEB'
FROM generate_series(
  date_trunc('month', CURRENT_DATE)::date,
  LEAST(CURRENT_DATE, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date),
  '1 day'::interval
) AS d
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
ON CONFLICT (user_id, work_date) DO NOTHING;

-- Pending leave for Faculty 1 (HR action center)
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO staff_leave_requests (
  tenant_id, staff_user_id, leave_type, start_date, end_date, reason, status
)
SELECT
  tenant.tenant_id,
  'b0000003-0000-4000-8000-000000000003',
  'CL',
  CURRENT_DATE + 7,
  CURRENT_DATE + 8,
  'Family function — pending HOD approval',
  'PENDING'
FROM tenant
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests
  WHERE staff_user_id = 'b0000003-0000-4000-8000-000000000003'
    AND status = 'PENDING'
    AND start_date = CURRENT_DATE + 7
);

-- HOD-approved leave awaiting HR
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO staff_leave_requests (
  tenant_id, staff_user_id, leave_type, start_date, end_date, reason, status
)
SELECT
  tenant.tenant_id,
  'b0000004-0000-4000-8000-000000000004',
  'SL',
  CURRENT_DATE + 3,
  CURRENT_DATE + 4,
  'Medical checkup — HOD approved',
  'HOD_APPROVED'
FROM tenant
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests
  WHERE staff_user_id = 'b0000004-0000-4000-8000-000000000004'
    AND status = 'HOD_APPROVED'
    AND start_date = CURRENT_DATE + 3
);

-- Pending gate pass for Faculty 1
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1)
INSERT INTO staff_gate_passes (
  tenant_id, staff_user_id, reporting_officer_id, out_time, expected_in_time, reason, status
)
SELECT
  tenant.tenant_id,
  'b0000003-0000-4000-8000-000000000003',
  'b0000004-0000-4000-8000-000000000004',
  (CURRENT_DATE + time '14:00')::timestamptz,
  (CURRENT_DATE + time '17:30')::timestamptz,
  'University bank visit',
  'PENDING'
FROM tenant
WHERE NOT EXISTS (
  SELECT 1 FROM staff_gate_passes
  WHERE staff_user_id = 'b0000003-0000-4000-8000-000000000003'
    AND status = 'PENDING'
    AND out_time::date = CURRENT_DATE
);

-- Hostel allocation for Student 2 (if rooms exist)
INSERT INTO hostel_allocations (student_user_id, room_id, bed_number, mess_plan, start_date, status)
SELECT
  'b0000002-0000-4000-8000-000000000002',
  r.room_id,
  'B2',
  'VEG',
  CURRENT_DATE - 30,
  'ACTIVE'
FROM operations_hostel_rooms r
ORDER BY r.room_id
LIMIT 1
ON CONFLICT (student_user_id) DO UPDATE SET
  room_id = EXCLUDED.room_id,
  bed_number = EXCLUDED.bed_number,
  status = 'ACTIVE';
