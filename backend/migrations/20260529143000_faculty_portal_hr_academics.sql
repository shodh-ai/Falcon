-- Faculty portal: Employee-style HR and VTOP-style academic actions.

CREATE TABLE IF NOT EXISTS staff_leave_requests (
  leave_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  staff_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'HOD_APPROVED', 'HR_APPROVED', 'REJECTED')),
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_payslips (
  payslip_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  staff_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  net_pay DECIMAL(10,2),
  file_path TEXT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_attendance_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  attendance_data JSONB NOT NULL,
  UNIQUE (tenant_id, course_id, faculty_user_id, date)
);

CREATE TABLE IF NOT EXISTS course_materials (
  material_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  course_id UUID REFERENCES academic_courses(course_id) ON DELETE CASCADE,
  faculty_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_key TEXT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_leave_requests_staff
  ON staff_leave_requests(tenant_id, staff_user_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_payslips_staff
  ON staff_payslips(tenant_id, staff_user_id, year);
CREATE INDEX IF NOT EXISTS idx_course_attendance_logs_course_date
  ON course_attendance_logs(tenant_id, course_id, date);
CREATE INDEX IF NOT EXISTS idx_course_materials_course
  ON course_materials(tenant_id, course_id);

-- Seed Ellwil as Faculty and provide dashboard data.
UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1),
    is_active = true
WHERE lower(official_email) = 'ellwil@mygyanvihar.com';

WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com') AS ellwil_id
)
INSERT INTO staff_payslips (tenant_id, staff_user_id, month, year, net_pay, file_path)
SELECT ctx.tenant_id, ctx.ellwil_id, data.month, data.year, data.net_pay, data.file_path
FROM ctx
CROSS JOIN (VALUES
  ('March', 2026, 78250.00, '/uploads/demo/payslips/ellwil-march-2026.pdf'),
  ('April', 2026, 78250.00, '/uploads/demo/payslips/ellwil-april-2026.pdf'),
  ('May', 2026, 80500.00, '/uploads/demo/payslips/ellwil-may-2026.pdf')
) AS data(month, year, net_pay, file_path)
WHERE ctx.ellwil_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM staff_payslips existing
  WHERE existing.tenant_id = ctx.tenant_id
    AND existing.staff_user_id = ctx.ellwil_id
    AND existing.month = data.month
    AND existing.year = data.year
);

WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com') AS ellwil_id
)
INSERT INTO hr_leave_balances (user_id, leave_type, year, entitled, used)
SELECT ctx.ellwil_id, data.leave_type, 2026, data.entitled, data.used
FROM ctx
CROSS JOIN (VALUES
  ('CL', 12.00, 0.00),
  ('SL', 10.00, 1.00),
  ('EL', 18.00, 2.00)
) AS data(leave_type, entitled, used)
WHERE ctx.ellwil_id IS NOT NULL
ON CONFLICT (user_id, leave_type, year) DO UPDATE SET
  entitled = EXCLUDED.entitled,
  used = EXCLUDED.used;

-- Ensure Sachin is in Ellwil's active classes via existing academic_timetables.
WITH ctx AS (
  SELECT
    (SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu') AS tenant_id,
    (SELECT user_id FROM users WHERE lower(official_email) = 'ellwil@mygyanvihar.com') AS ellwil_id
)
UPDATE academic_timetables t
SET faculty_user_id = ctx.ellwil_id
FROM ctx
WHERE t.tenant_id = ctx.tenant_id
  AND t.course_id IN (
    SELECT course_id FROM academic_courses
    WHERE tenant_id = ctx.tenant_id
      AND course_code IN ('CSE301', 'CSE302', 'OE501', 'OE502', 'OE503', 'OE504')
  );
