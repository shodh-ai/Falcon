-- ESS Team workspace demo: hod@mygyanvihar.com as reporting officer with pending inbox + matrix data.
-- Login: hod@mygyanvihar.com / password123

-- Indirect reportee chain: ellwil reports to faculty1, faculty1 reports to hod
UPDATE users faculty
SET reporting_officer_id = hod.user_id
FROM users hod
WHERE lower(hod.official_email) = 'hod@mygyanvihar.com'
  AND lower(faculty.official_email) = 'faculty1@mygyanvihar.com'
  AND faculty.reporting_officer_id IS DISTINCT FROM hod.user_id;

UPDATE users ellwil
SET reporting_officer_id = faculty.user_id,
    dept_id = COALESCE(faculty.dept_id, ellwil.dept_id)
FROM users faculty
WHERE lower(faculty.official_email) = 'faculty1@mygyanvihar.com'
  AND lower(ellwil.official_email) = 'ellwil@mygyanvihar.com'
  AND ellwil.reporting_officer_id IS DISTINCT FROM faculty.user_id;

WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
hod AS (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1),
ellwil AS (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com' LIMIT 1)
UPDATE staff_leave_requests r
SET current_approver_user_id = hod.user_id,
    current_step_order = 1
FROM tenant, hod, faculty
WHERE r.tenant_id = tenant.tenant_id
  AND r.staff_user_id = faculty.user_id
  AND r.status = 'PENDING'
  AND r.current_approver_user_id IS DISTINCT FROM hod.user_id;

-- Additional pending queues for HOD (direct scope)
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
hod AS (SELECT user_id FROM users WHERE lower(official_email) = 'hod@mygyanvihar.com' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1),
ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1)
INSERT INTO staff_leave_requests (
  tenant_id, staff_user_id, entity_id, leave_type, start_date, end_date, reason, status,
  request_type, current_approver_user_id, current_step_order
)
SELECT tenant.tenant_id, faculty.user_id, ent.entity_id, data.ltype, data.sd, data.ed, data.reason,
       'PENDING', data.rtype, hod.user_id, 1
FROM tenant, hod, faculty, ent
CROSS JOIN (VALUES
  ('OD',  CURRENT_DATE::date,     CURRENT_DATE::date,     'Industry visit — CS dept trip',  'ON_DUTY'),
  ('OD',  (CURRENT_DATE + 1)::date, (CURRENT_DATE + 1)::date, 'Conference presentation',    'ON_DUTY'),
  ('REG', (CURRENT_DATE - 2)::date, (CURRENT_DATE - 2)::date, 'Missed punch after lab session', 'REGULARIZATION'),
  ('COMP_OFF', (CURRENT_DATE + 5)::date, (CURRENT_DATE + 5)::date, 'Weekend workshop duty credit', 'COMP_OFF_CREDIT')
) AS data(ltype, sd, ed, reason, rtype)
WHERE NOT EXISTS (
  SELECT 1 FROM staff_leave_requests sl
  WHERE sl.staff_user_id = faculty.user_id
    AND sl.request_type = data.rtype
    AND sl.status = 'PENDING'
    AND sl.reason = data.reason
);

-- Pending document for faculty1
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
ent AS (SELECT entity_id FROM org_entities WHERE entity_code = 'SGVU_UNIVERSITY' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_employee_documents (tenant_id, entity_id, user_id, document_type, file_url, verification_status)
SELECT tenant.tenant_id, ent.entity_id, faculty.user_id, 'AADHAAR', '/uploads/demo/aadhaar-faculty1.pdf', 'PENDING'
FROM tenant, ent, faculty
WHERE NOT EXISTS (
  SELECT 1 FROM hr_employee_documents d
  WHERE d.user_id = faculty.user_id AND d.document_type = 'AADHAAR' AND d.verification_status = 'PENDING'
);

-- Appraisal pending HOD review (faculty1)
WITH tenant AS (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1),
faculty AS (SELECT user_id FROM users WHERE lower(official_email) = 'faculty1@mygyanvihar.com' LIMIT 1)
INSERT INTO hr_employee_appraisals (tenant_id, user_id, appraisal_year, auto_api_score, hod_rating, hr_final_status)
SELECT tenant.tenant_id, faculty.user_id, 2026, 78.50, NULL, 'HOD_REVIEW'
FROM tenant, faculty
ON CONFLICT (tenant_id, user_id, appraisal_year) DO UPDATE SET hr_final_status = 'HOD_REVIEW';

-- Richer attendance for team matrix (faculty1 + ellwil, current month)
WITH staff AS (
  SELECT u.user_id, lower(u.official_email) AS email
  FROM users u
  WHERE lower(u.official_email) IN ('faculty1@mygyanvihar.com', 'ellwil@mygyanvihar.com')
),
days AS (
  SELECT d::date AS work_date
  FROM generate_series(
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
    '1 day'::interval
  ) AS d
),
matrix AS (
  SELECT
    s.user_id,
    d.work_date,
    CASE
      WHEN s.email = 'faculty1@mygyanvihar.com' AND EXTRACT(DAY FROM d.work_date)::int % 9 = 0 THEN 'ABSENT'
      WHEN s.email = 'faculty1@mygyanvihar.com' AND EXTRACT(DAY FROM d.work_date)::int % 7 = 0 THEN 'LATE_COMING'
      WHEN s.email = 'ellwil@mygyanvihar.com' AND EXTRACT(DAY FROM d.work_date)::int % 11 = 0 THEN 'EARLY_GOING'
      WHEN EXTRACT(DOW FROM d.work_date) IN (0, 6) THEN 'WEEK_OFF'
      ELSE 'FULL_DAY'
    END AS calc
  FROM staff s
  CROSS JOIN days d
)
INSERT INTO hr_daily_attendance (user_id, date, first_in_time, last_out_time, total_hours, status, calculated_status)
SELECT
  m.user_id,
  m.work_date,
  CASE WHEN m.calc IN ('ABSENT', 'WEEK_OFF') THEN NULL ELSE (m.work_date + time '09:05')::timestamptz END,
  CASE
    WHEN m.calc = 'ABSENT' OR m.calc = 'WEEK_OFF' THEN NULL
    WHEN m.calc = 'EARLY_GOING' THEN (m.work_date + time '15:30')::timestamptz
    WHEN m.calc = 'LATE_COMING' THEN (m.work_date + time '17:00')::timestamptz
    ELSE (m.work_date + time '17:00')::timestamptz
  END,
  CASE m.calc
    WHEN 'FULL_DAY' THEN 8.00
    WHEN 'LATE_COMING' THEN 7.50
    WHEN 'EARLY_GOING' THEN 6.50
    WHEN 'ABSENT' THEN NULL
    ELSE NULL
  END,
  CASE WHEN m.calc = 'ABSENT' THEN 'ABSENT' WHEN m.calc = 'WEEK_OFF' THEN 'ABSENT' ELSE 'PRESENT' END,
  m.calc
FROM matrix m
WHERE m.calc != 'WEEK_OFF'
ON CONFLICT (user_id, date) DO UPDATE SET
  first_in_time = EXCLUDED.first_in_time,
  last_out_time = EXCLUDED.last_out_time,
  total_hours = EXCLUDED.total_hours,
  status = EXCLUDED.status,
  calculated_status = EXCLUDED.calculated_status,
  updated_at = NOW();
