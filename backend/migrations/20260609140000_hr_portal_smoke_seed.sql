-- HR portal smoke data: dashboard attendance mix, pending actions, directory profiles,
-- monthly matrix history, recruitment entity scope, and sample workflows.
-- Login: hr.admin@mygyanvihar.com / hr@mygyanvihar.com — password: password123

-- ---------------------------------------------------------------------------
-- 1. Rich employee profiles (designations, join dates, shift, entity)
-- ---------------------------------------------------------------------------
WITH ctx AS (
  SELECT
    t.tenant_id,
    oe.entity_id,
    (SELECT shift_id FROM hr_shifts WHERE shift_name = 'Faculty 9-4' AND entity_id = oe.entity_id LIMIT 1) AS faculty_shift,
    (SELECT shift_id FROM hr_shifts WHERE shift_name = 'Admin 9-6' AND entity_id = oe.entity_id LIMIT 1) AS admin_shift
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
),
staff AS (
  SELECT
    u.user_id,
    u.tenant_id,
    data.designation,
    data.employee_id,
    data.joining_date::date AS joining_date,
    CASE WHEN data.use_faculty_shift THEN ctx.faculty_shift ELSE ctx.admin_shift END AS shift_id,
    ctx.entity_id
  FROM users u
  CROSS JOIN ctx
  JOIN (VALUES
    ('faculty1@mygyanvihar.com',  'Assistant Professor',     'SGVU-FAC-001', (CURRENT_DATE - 900)::text,  true),
    ('hod@mygyanvihar.com',       'Head of Department',      'SGVU-HOD-001', (CURRENT_DATE - 1500)::text, true),
    ('hr@mygyanvihar.com',        'HR Executive',            'SGVU-HR-001',  (CURRENT_DATE - 600)::text,  false),
    ('hr.admin@mygyanvihar.com',  'Master HR Administrator', 'SGVU-HR-ADMIN',(CURRENT_DATE - 400)::text,  false),
    ('warden@mygyanvihar.com',    'Hostel Warden',           'SGVU-WAR-001', (CURRENT_DATE - 700)::text,  false),
    ('finance@mygyanvihar.com',   'Finance Manager',         'SGVU-FIN-001', (CURRENT_DATE - 12)::text,   false),
    ('iqac@mygyanvihar.com',      'IQAC Officer',            'SGVU-IQAC-01', (CURRENT_DATE - 500)::text,  false),
    ('library@mygyanvihar.com',   'Chief Librarian',         'SGVU-LIB-001', (CURRENT_DATE - 8)::text,    false),
    ('president@mygyanvihar.com', 'Vice Chancellor',         'SGVU-VC-001',  (CURRENT_DATE - 2000)::text, false),
    ('ellwil@mygyanvihar.com',    'Senior Faculty',          'SGVU-ELL-001', (CURRENT_DATE - 1100)::text, true)
  ) AS data(email, designation, employee_id, joining_date, use_faculty_shift)
    ON lower(u.official_email) = lower(data.email)
)
INSERT INTO hr_employee_profiles (
  tenant_id, user_id, employee_id, designation, joining_date, entity_id, shift_id, week_off_day
)
SELECT s.tenant_id, s.user_id, s.employee_id, s.designation, s.joining_date, s.entity_id, s.shift_id, 0
FROM staff s
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  designation = EXCLUDED.designation,
  joining_date = EXCLUDED.joining_date,
  entity_id = EXCLUDED.entity_id,
  shift_id = COALESCE(EXCLUDED.shift_id, hr_employee_profiles.shift_id);

WITH ctx AS (
  SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1
)
UPDATE users u
SET entity_id = hep.entity_id
FROM hr_employee_profiles hep, ctx
WHERE u.user_id = hep.user_id AND hep.entity_id = ctx.entity_id AND u.entity_id IS DISTINCT FROM hep.entity_id;

INSERT INTO user_entity_access (user_id, entity_id)
SELECT ep.user_id, ep.entity_id
FROM hr_employee_profiles ep
WHERE ep.entity_id IS NOT NULL
ON CONFLICT (user_id, entity_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Today's attendance mix (present / late / absent / unmarked + on-leave)
-- ---------------------------------------------------------------------------
WITH staff AS (
  SELECT u.user_id, lower(u.official_email) AS email
  FROM users u
  WHERE lower(u.official_email) IN (
    'faculty1@mygyanvihar.com', 'hod@mygyanvihar.com', 'hr@mygyanvihar.com',
    'hr.admin@mygyanvihar.com', 'warden@mygyanvihar.com', 'finance@mygyanvihar.com',
    'library@mygyanvihar.com', 'president@mygyanvihar.com', 'ellwil@mygyanvihar.com'
  )
)
INSERT INTO hr_daily_attendance (user_id, date, first_in_time, last_out_time, total_hours, status, calculated_status)
SELECT
  s.user_id,
  CURRENT_DATE,
  data.first_in,
  data.last_out,
  data.hours,
  data.status,
  data.calc
FROM staff s
JOIN (VALUES
  ('faculty1@mygyanvihar.com',  (CURRENT_DATE + time '09:22')::timestamptz, (CURRENT_DATE + time '16:05')::timestamptz, 7.70, 'PRESENT',      'LATE_COMING'),
  ('hod@mygyanvihar.com',       (CURRENT_DATE + time '08:55')::timestamptz, (CURRENT_DATE + time '17:10')::timestamptz, 8.25, 'PRESENT',      'FULL_DAY'),
  ('hr@mygyanvihar.com',        (CURRENT_DATE + time '09:02')::timestamptz, (CURRENT_DATE + time '18:01')::timestamptz, 8.95, 'PRESENT',      'FULL_DAY'),
  ('hr.admin@mygyanvihar.com',  (CURRENT_DATE + time '08:50')::timestamptz, (CURRENT_DATE + time '18:15')::timestamptz, 9.40, 'PRESENT',      'FULL_DAY'),
  ('warden@mygyanvihar.com',    NULL::timestamptz,                          NULL::timestamptz,                          NULL, 'ABSENT',       'ABSENT'),
  ('library@mygyanvihar.com',   (CURRENT_DATE + time '09:10')::timestamptz, (CURRENT_DATE + time '17:00')::timestamptz, 7.80, 'PRESENT',      'FULL_DAY'),
  ('president@mygyanvihar.com', (CURRENT_DATE + time '10:00')::timestamptz, (CURRENT_DATE + time '16:30')::timestamptz, 6.50, 'PRESENT',      'EARLY_GOING'),
  ('ellwil@mygyanvihar.com',    (CURRENT_DATE + time '09:05')::timestamptz, (CURRENT_DATE + time '16:00')::timestamptz, 6.90, 'PRESENT',      'FULL_DAY')
) AS data(email, first_in, last_out, hours, status, calc)
  ON s.email = data.email
ON CONFLICT (user_id, date) DO UPDATE SET
  first_in_time = EXCLUDED.first_in_time,
  last_out_time = EXCLUDED.last_out_time,
  total_hours = EXCLUDED.total_hours,
  status = EXCLUDED.status,
  calculated_status = EXCLUDED.calculated_status,
  updated_at = NOW();

-- iqac@ deliberately unmarked (no row) for dashboard "Unmarked" bucket

-- ---------------------------------------------------------------------------
-- 3. Pending leave / regularization / on-leave today
-- ---------------------------------------------------------------------------
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
finance AS (SELECT user_id FROM users WHERE lower(official_email) = 'finance@mygyanvihar.com' LIMIT 1),
warden AS (SELECT user_id FROM users WHERE lower(official_email) = 'warden@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1),
hod AS (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1)
INSERT INTO staff_leave_requests (
  tenant_id, staff_user_id, leave_type, start_date, end_date, reason, status, request_type,
  regularization_date, missed_punch_type
)
SELECT tenant.tenant_id, finance.user_id, 'SL', CURRENT_DATE, CURRENT_DATE,
       'Medical appointment — approved by HOD', 'HOD_APPROVED', 'LEAVE', NULL, NULL
FROM tenant, finance
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests sl
  WHERE sl.staff_user_id = finance.user_id AND sl.request_type = 'LEAVE'
    AND sl.start_date = CURRENT_DATE AND sl.end_date = CURRENT_DATE
)
UNION ALL
SELECT tenant.tenant_id, warden.user_id, 'REG', CURRENT_DATE - 1, CURRENT_DATE - 1,
       'Missed evening punch — hostel emergency', 'PENDING', 'REGULARIZATION', CURRENT_DATE - 1, 'OUT'
FROM tenant, warden
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests sl
  WHERE sl.staff_user_id = warden.user_id AND sl.request_type = 'REGULARIZATION' AND sl.status = 'PENDING'
)
UNION ALL
SELECT tenant.tenant_id, faculty.user_id, 'CL', CURRENT_DATE + 7, CURRENT_DATE + 8,
       'Family function — pending HOD approval', 'PENDING', 'LEAVE', NULL, NULL
FROM tenant, faculty
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests sl
  WHERE sl.staff_user_id = faculty.user_id AND sl.status = 'PENDING' AND sl.start_date = CURRENT_DATE + 7
)
UNION ALL
SELECT tenant.tenant_id, hod.user_id, 'SL', CURRENT_DATE + 3, CURRENT_DATE + 4,
       'Medical checkup — HOD approved, awaiting HR', 'HOD_APPROVED', 'LEAVE', NULL, NULL
FROM tenant, hod
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests sl
  WHERE sl.staff_user_id = hod.user_id AND sl.status = 'HOD_APPROVED' AND sl.start_date = CURRENT_DATE + 3
);

-- ---------------------------------------------------------------------------
-- 4. Offboarding / FNF + attrition trend exits
-- ---------------------------------------------------------------------------
WITH ctx AS (
  SELECT t.tenant_id, oe.entity_id
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
),
iqac AS (SELECT user_id FROM users WHERE lower(official_email) = 'iqac@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_resignation_requests (tenant_id, entity_id, user_id, last_working_day, reason, status)
SELECT ctx.tenant_id, ctx.entity_id, iqac.user_id, CURRENT_DATE + 21,
       'Relocation — notice period served, FNF clearance pending', 'FNF_PENDING'
FROM ctx, iqac
WHERE NOT EXISTS (
  SELECT 1 FROM hr_resignation_requests rr
  WHERE rr.user_id = iqac.user_id AND rr.status = 'FNF_PENDING'
);

-- Historical exits for attrition chart (idempotent by user + month)
WITH ctx AS (
  SELECT t.tenant_id, oe.entity_id
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
),
exits AS (
  SELECT u.user_id, data.lwd::date AS last_working_day, data.reason, data.status
  FROM users u
  JOIN (VALUES
    ('faculty1@mygyanvihar.com', (date_trunc('month', CURRENT_DATE) - interval '2 months' + interval '14 days')::date, 'Demo exit — contract ended', 'FNF_COMPLETED'),
    ('warden@mygyanvihar.com',   (date_trunc('month', CURRENT_DATE) - interval '1 month' + interval '20 days')::date,  'Demo exit — personal reasons', 'FNF_COMPLETED')
  ) AS data(email, lwd, reason, status) ON lower(u.official_email) = lower(data.email)
)
INSERT INTO hr_resignation_requests (tenant_id, entity_id, user_id, last_working_day, reason, status)
SELECT ctx.tenant_id, ctx.entity_id, e.user_id, e.last_working_day, e.reason, e.status
FROM ctx, exits e
WHERE NOT EXISTS (
  SELECT 1 FROM hr_resignation_requests rr
  WHERE rr.user_id = e.user_id AND rr.last_working_day = e.last_working_day
);

-- ---------------------------------------------------------------------------
-- 5. Current-month matrix history (weekdays only, mixed statuses)
-- ---------------------------------------------------------------------------
WITH staff AS (
  SELECT u.user_id, lower(u.official_email) AS email
  FROM users u
  WHERE lower(u.official_email) IN ('faculty1@mygyanvihar.com', 'hod@mygyanvihar.com', 'hr@mygyanvihar.com')
),
days AS (
  SELECT d::date AS work_date
  FROM generate_series(
    date_trunc('month', CURRENT_DATE)::date,
    LEAST(CURRENT_DATE - 1, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date),
    '1 day'::interval
  ) AS d
  WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
),
matrix AS (
  SELECT
    s.user_id,
    d.work_date,
    CASE
      WHEN s.email = 'faculty1@mygyanvihar.com' AND EXTRACT(DAY FROM d.work_date)::int % 11 = 0 THEN 'ABSENT'
      WHEN s.email = 'hod@mygyanvihar.com' AND EXTRACT(DAY FROM d.work_date)::int % 13 = 0 THEN 'LATE_COMING'
      WHEN s.email = 'hr@mygyanvihar.com' AND EXTRACT(DAY FROM d.work_date)::int % 17 = 0 THEN 'HALF_DAY'
      ELSE 'FULL_DAY'
    END AS calc
  FROM staff s
  CROSS JOIN days d
)
INSERT INTO hr_daily_attendance (user_id, date, first_in_time, last_out_time, total_hours, status, calculated_status)
SELECT
  m.user_id,
  m.work_date,
  (m.work_date + time '09:05')::timestamptz,
  CASE m.calc
    WHEN 'HALF_DAY' THEN (m.work_date + time '13:00')::timestamptz
    WHEN 'ABSENT' THEN NULL
    ELSE (m.work_date + time '17:00')::timestamptz
  END,
  CASE m.calc
    WHEN 'FULL_DAY' THEN 8.00
    WHEN 'LATE_COMING' THEN 7.50
    WHEN 'HALF_DAY' THEN 4.00
    ELSE NULL
  END,
  CASE m.calc WHEN 'ABSENT' THEN 'ABSENT' ELSE 'PRESENT' END,
  m.calc
FROM matrix m
ON CONFLICT (user_id, date) DO UPDATE SET
  calculated_status = EXCLUDED.calculated_status,
  status = EXCLUDED.status,
  total_hours = EXCLUDED.total_hours,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 6. Entity scope on recruitment + holidays + pay packages
-- ---------------------------------------------------------------------------
WITH ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1)
UPDATE hr_job_postings jp SET entity_id = ent.entity_id FROM ent WHERE jp.entity_id IS NULL;

WITH ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1)
UPDATE hr_applicants a SET entity_id = ent.entity_id FROM ent WHERE a.entity_id IS NULL;

WITH ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1)
DELETE FROM hr_holidays h
WHERE h.entity_id IS NULL
  AND h.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM hr_holidays h2
    WHERE h2.holiday_id <> h.holiday_id
      AND h2.date = h.date
      AND h2.title = h.title
      AND h2.entity_id IS NOT NULL
      AND h2.deleted_at IS NULL
  );

WITH ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1)
UPDATE hr_holidays h SET entity_id = ent.entity_id FROM ent WHERE h.entity_id IS NULL;

WITH ctx AS (
  SELECT t.tenant_id FROM public.tenants t WHERE t.subdomain = 'sgvu' LIMIT 1
),
staff AS (
  SELECT u.user_id, u.tenant_id, COALESCE(u.salary_base, 50000) AS basic
  FROM users u
  WHERE lower(u.official_email) IN ('faculty1@mygyanvihar.com', 'hod@mygyanvihar.com', 'hr@mygyanvihar.com')
)
INSERT INTO hr_employee_pay_packages (tenant_id, user_id, basic_pay, hra, da, pf_deduction, tds_deduction, net_salary)
SELECT
  s.tenant_id,
  s.user_id,
  s.basic,
  ROUND(s.basic * 0.40, 2),
  ROUND(s.basic * 0.16, 2),
  ROUND(s.basic * 0.12, 2),
  ROUND(s.basic * 0.08, 2),
  ROUND(s.basic * 1.36 - s.basic * 0.20, 2)
FROM staff s
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  basic_pay = EXCLUDED.basic_pay,
  net_salary = EXCLUDED.net_salary,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 7. Leave policies + default approval workflow (admin builders)
-- ---------------------------------------------------------------------------
WITH ctx AS (
  SELECT t.tenant_id, oe.entity_id
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
)
INSERT INTO hr_leave_policies (
  tenant_id, entity_id, leave_name, leave_code, leave_count, disbursement_cycle, is_paid
)
SELECT ctx.tenant_id, ctx.entity_id, data.name, data.code, data.cnt, 'YEARLY', TRUE
FROM ctx
CROSS JOIN (VALUES
  ('Casual Leave', 'CL', 12.00),
  ('Sick Leave', 'SL', 10.00),
  ('Earned Leave', 'EL', 18.00)
) AS data(name, code, cnt)
ON CONFLICT (tenant_id, entity_id, leave_code) DO NOTHING;

WITH ctx AS (
  SELECT t.tenant_id, oe.entity_id
  FROM public.tenants t
  JOIN org_entities oe ON oe.tenant_id = t.tenant_id AND oe.entity_code = 'SGVU_UNIVERSITY'
  WHERE t.subdomain = 'sgvu'
  LIMIT 1
),
wf AS (
  INSERT INTO hr_approval_workflows (tenant_id, entity_id, action_type, workflow_name, is_active)
  SELECT ctx.tenant_id, ctx.entity_id, 'LEAVE', 'Standard Leave Approval', TRUE
  FROM ctx
  WHERE NOT EXISTS (
    SELECT 1 FROM hr_approval_workflows w
    WHERE w.tenant_id = ctx.tenant_id AND w.entity_id = ctx.entity_id AND w.action_type = 'LEAVE'
  )
  RETURNING workflow_id
),
wf_ctx AS (
  SELECT workflow_id FROM wf
  UNION ALL
  SELECT w.workflow_id
  FROM hr_approval_workflows w
  JOIN ctx ON w.tenant_id = ctx.tenant_id AND w.entity_id = ctx.entity_id
  WHERE w.action_type = 'LEAVE'
  LIMIT 1
)
INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
SELECT wf_ctx.workflow_id, data.ord, data.typ, data.ref
FROM wf_ctx
CROSS JOIN (VALUES
  (1, 'REPORTING_MANAGER', NULL::varchar),
  (2, 'ROLE', 'HR')
) AS data(ord, typ, ref)
ON CONFLICT (workflow_id, step_order) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Appraisal records for appraisals workspace
-- ---------------------------------------------------------------------------
WITH ctx AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_employee_appraisals (tenant_id, user_id, appraisal_year, auto_api_score, hod_rating, hr_final_status)
SELECT ctx.tenant_id, faculty.user_id, 2026, 78.50, 4.20, 'HOD_REVIEW'
FROM ctx, faculty
ON CONFLICT (tenant_id, user_id, appraisal_year) DO UPDATE SET
  auto_api_score = EXCLUDED.auto_api_score,
  hod_rating = EXCLUDED.hod_rating,
  hr_final_status = EXCLUDED.hr_final_status;

WITH ctx AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
hod AS (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_employee_appraisals (tenant_id, user_id, appraisal_year, auto_api_score, hod_rating, hr_final_status)
SELECT ctx.tenant_id, hod.user_id, 2026, 82.00, 4.50, 'HR_APPROVED'
FROM ctx, hod
ON CONFLICT (tenant_id, user_id, appraisal_year) DO UPDATE SET
  auto_api_score = EXCLUDED.auto_api_score,
  hod_rating = EXCLUDED.hod_rating,
  hr_final_status = EXCLUDED.hr_final_status;
