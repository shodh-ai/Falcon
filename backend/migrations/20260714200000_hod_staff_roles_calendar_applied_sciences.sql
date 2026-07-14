-- HOD staff role assignments, department academic calendar, student branch names,
-- IQAC additional activities, and Applied Sciences demo data for approval modules.

CREATE TABLE IF NOT EXISTS hod_dept_staff_roles (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  dept_id INT NOT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
  role_type VARCHAR(50) NOT NULL,
  faculty_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, dept_id, role_type)
);

CREATE INDEX IF NOT EXISTS idx_hod_dept_staff_roles_dept
  ON hod_dept_staff_roles(tenant_id, dept_id);

CREATE TABLE IF NOT EXISTS hod_dept_academic_calendar (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  dept_id INT NOT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  description TEXT,
  academic_year VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hod_dept_calendar_dept_date
  ON hod_dept_academic_calendar(tenant_id, dept_id, activity_date);

CREATE TABLE IF NOT EXISTS hod_iqac_additional_activities (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  dept_id INT NOT NULL REFERENCES departments(dept_id) ON DELETE CASCADE,
  activity_name VARCHAR(255) NOT NULL,
  activity_date DATE,
  description TEXT,
  file_path TEXT,
  file_name VARCHAR(255),
  uploaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  academic_year VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hod_iqac_additional_dept
  ON hod_iqac_additional_activities(tenant_id, dept_id, academic_year);

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS branch_name VARCHAR(120);

DO $$
DECLARE
  v_tenant UUID;
  v_dept INT;
  v_hod UUID;
  v_fac1 UUID;
  v_fac2 UUID;
  v_fac3 UUID;
  v_student UUID;
  v_student2 UUID;
  v_club UUID;
  v_venue UUID;
  v_course UUID;
  v_entity INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT dept_id, hod_user_id INTO v_dept, v_hod
  FROM departments WHERE dept_name = 'Applied Sciences' LIMIT 1;
  IF v_dept IS NULL THEN RETURN; END IF;

  SELECT user_id INTO v_fac1 FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod ORDER BY u.name LIMIT 1 OFFSET 0;
  SELECT user_id INTO v_fac2 FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod ORDER BY u.name LIMIT 1 OFFSET 1;
  SELECT user_id INTO v_fac3 FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod ORDER BY u.name LIMIT 1 OFFSET 2;

  IF v_fac1 IS NULL THEN v_fac1 := v_hod; END IF;
  IF v_fac2 IS NULL THEN v_fac2 := v_fac1; END IF;
  IF v_fac3 IS NULL THEN v_fac3 := v_fac1; END IF;

  -- Staff role assignments (duties & responsibilities)
  INSERT INTO hod_dept_staff_roles (tenant_id, dept_id, role_type, faculty_user_id, updated_by)
  VALUES
    (v_tenant, v_dept, 'MIDTERM_COORDINATOR', v_fac1, v_hod),
    (v_tenant, v_dept, 'TIMETABLE_COORDINATOR', v_fac2, v_hod),
    (v_tenant, v_dept, 'LAB_INCHARGE', v_fac3, v_hod),
    (v_tenant, v_dept, 'EXAM_COORDINATOR', v_fac1, v_hod),
    (v_tenant, v_dept, 'INTERNAL_MARKS_COORDINATOR', v_fac2, v_hod)
  ON CONFLICT (tenant_id, dept_id, role_type) DO UPDATE SET
    faculty_user_id = EXCLUDED.faculty_user_id,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  -- Placement coordinator (existing table)
  IF to_regclass('public.hod_dept_placement_settings') IS NOT NULL THEN
    INSERT INTO hod_dept_placement_settings (tenant_id, dept_id, coordinator_user_id, updated_by, updated_at)
    VALUES (v_tenant, v_dept, v_fac3, v_hod, NOW())
    ON CONFLICT (tenant_id, dept_id) DO UPDATE SET
      coordinator_user_id = EXCLUDED.coordinator_user_id,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW();
  END IF;

  -- Department academic calendar (date-wise activities)
  INSERT INTO hod_dept_academic_calendar (tenant_id, dept_id, activity_date, activity_name, description, academic_year)
  SELECT v_tenant, v_dept, d.activity_date, d.activity_name, d.description, '2026-2027'
  FROM (VALUES
    (CURRENT_DATE + 1, 'Mid-Semester Examination — Sem III & V', 'University academic calendar: midterm exams for Applied Sciences'),
    (CURRENT_DATE + 7, 'Department Faculty Meeting', 'Monthly review of syllabus coverage and lab schedules'),
    (CURRENT_DATE + 14, 'Industry Expert Lecture — Environmental Science', 'Guest lecture for B.Sc Environmental Science branch'),
    (CURRENT_DATE + 21, 'Internal Assessment Marks Submission Deadline', 'Faculty to upload IA marks on portal'),
    (CURRENT_DATE + 30, 'Science Fest & Project Exhibition', 'Inter-branch project showcase for Applied Sciences students')
  ) AS d(activity_date, activity_name, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM hod_dept_academic_calendar c
    WHERE c.tenant_id = v_tenant AND c.dept_id = v_dept AND c.activity_name = d.activity_name
  );

  -- Student branch names (multi-branch department)
  UPDATE student_profiles sp SET branch_name = mapped.branch_name, updated_at = NOW()
  FROM (
    SELECT u.user_id,
      CASE (ROW_NUMBER() OVER (ORDER BY u.name))::int % 4
        WHEN 0 THEN 'B.Sc Physics'
        WHEN 1 THEN 'B.Sc Chemistry'
        WHEN 2 THEN 'B.Sc Mathematics'
        ELSE 'B.Sc Environmental Science'
      END AS branch_name
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Student'
  ) mapped
  WHERE sp.user_id = mapped.user_id;

  -- Resignation pending HOD clearance
  SELECT entity_id INTO v_entity FROM org_entities WHERE tenant_id = v_tenant AND entity_code = 'SGVU_UNIVERSITY' LIMIT 1;
  IF v_fac2 IS NOT NULL AND to_regclass('public.hr_resignation_requests') IS NOT NULL AND v_entity IS NOT NULL THEN
    INSERT INTO hr_resignation_requests (tenant_id, entity_id, user_id, last_working_day, reason, status)
    SELECT v_tenant, v_entity, v_fac2, CURRENT_DATE + 30,
           'Applied Sciences faculty — personal relocation, seeking HOD clearance', 'PENDING_HOD'
    WHERE NOT EXISTS (
      SELECT 1 FROM hr_resignation_requests r
      WHERE r.user_id = v_fac2 AND r.status = 'PENDING_HOD'
    );
  END IF;

  -- Profile correction ticket
  SELECT user_id INTO v_student FROM users u JOIN roles r ON r.role_id = u.role_id
  WHERE u.dept_id = v_dept AND r.role_name = 'Student' ORDER BY u.name LIMIT 1;
  IF v_student IS NOT NULL AND to_regclass('public.helpdesk_tickets') IS NOT NULL THEN
    INSERT INTO helpdesk_tickets (student_user_id, category, subject, description, status, assigned_to_user_id, conversation)
    SELECT v_student, 'STUDENT_PROFILE',
           'Branch name correction — Applied Sciences demo',
           'Please update my branch from Applied Sciences to B.Sc Chemistry on the student profile.',
           'PENDING', v_hod, '[]'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM helpdesk_tickets t
      WHERE t.student_user_id = v_student AND t.category = 'STUDENT_PROFILE'
        AND t.subject ILIKE '%Branch name correction%'
    );
  END IF;

  -- Proxy / alternate teaching
  SELECT course_id INTO v_course FROM academic_courses WHERE tenant_id = v_tenant AND course_code LIKE 'SAS%' LIMIT 1;
  IF v_course IS NOT NULL AND to_regclass('public.academic_proxy_requests') IS NOT NULL THEN
    INSERT INTO academic_proxy_requests (
      tenant_id, absent_faculty_id, proxy_faculty_id, course_id, date_of_proxy, reason, status
    )
    SELECT v_tenant, v_fac1, v_fac2, v_course, CURRENT_DATE + 2,
           'Applied Sciences — faculty conference leave, proxy class required', 'PENDING_HOD_APPROVAL'
    WHERE NOT EXISTS (
      SELECT 1 FROM academic_proxy_requests pr
      WHERE pr.tenant_id = v_tenant AND pr.absent_faculty_id = v_fac1 AND pr.status = 'PENDING_HOD_APPROVAL'
        AND pr.reason ILIKE '%Applied Sciences%'
    );
  END IF;

  -- Club event pending HOD approval
  IF to_regclass('public.campus_clubs') IS NOT NULL AND to_regclass('public.campus_events') IS NOT NULL THEN
    INSERT INTO campus_clubs (tenant_id, name, description, club_type, applications_open, focus_area, faculty_advisor_id)
    SELECT v_tenant, 'Applied Sciences Science Club', 'Department science club for SAS students', 'CLUB', true, 'STEM', v_fac1
    WHERE NOT EXISTS (
      SELECT 1 FROM campus_clubs WHERE tenant_id = v_tenant AND name = 'Applied Sciences Science Club'
    );
    SELECT club_id INTO v_club FROM campus_clubs WHERE tenant_id = v_tenant AND name = 'Applied Sciences Science Club' LIMIT 1;

    IF v_club IS NOT NULL THEN
      INSERT INTO campus_events (
        tenant_id, club_id, title, description, venue, event_date,
        total_slots, available_slots, is_paid, ticket_price, funds_needed, status,
        advisor_approval, hod_approval, dean_approval, estate_approval, finance_approval
      )
      SELECT v_tenant, v_club, 'Applied Sciences Science Expo 2026',
             'Annual department science exhibition — pending HOD approval',
             'Applied Sciences Block Seminar Hall', CURRENT_DATE + 10,
             80, 80, false, 0, 0, 'PENDING_HOD',
             'APPROVED', 'PENDING', 'PENDING', 'NOT_REQUIRED', 'NOT_REQUIRED'
      WHERE NOT EXISTS (
        SELECT 1 FROM campus_events WHERE tenant_id = v_tenant AND title = 'Applied Sciences Science Expo 2026'
      );
    END IF;
  END IF;

  -- Department venue request
  IF to_regclass('public.campus_venues') IS NOT NULL AND to_regclass('public.venue_bookings') IS NOT NULL THEN
    INSERT INTO campus_venues (tenant_id, name, capacity, amenities, is_bookable_by_students, approver_role, max_duration_mins)
    SELECT v_tenant, 'Applied Sciences Seminar Hall', 50,
           '["Projector", "Whiteboard", "Lab Demo Setup"]'::jsonb, true, 'HOD', 180
    WHERE NOT EXISTS (
      SELECT 1 FROM campus_venues WHERE tenant_id = v_tenant AND name = 'Applied Sciences Seminar Hall'
    );
    SELECT venue_id INTO v_venue FROM campus_venues WHERE tenant_id = v_tenant AND name = 'Applied Sciences Seminar Hall' LIMIT 1;

    SELECT user_id INTO v_student2 FROM users u JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Student' ORDER BY u.name LIMIT 1 OFFSET 1;

    IF v_venue IS NOT NULL AND v_student2 IS NOT NULL THEN
      INSERT INTO venue_bookings (tenant_id, venue_id, student_user_id, start_time, end_time, purpose, status)
      SELECT v_tenant, v_venue, v_student2,
             (CURRENT_DATE + 5)::timestamptz + TIME '14:00',
             (CURRENT_DATE + 5)::timestamptz + TIME '16:00',
             'Branch project presentation — B.Sc Chemistry batch', 'PENDING_APPROVAL'
      WHERE NOT EXISTS (
        SELECT 1 FROM venue_bookings b
        WHERE b.tenant_id = v_tenant AND b.venue_id = v_venue AND b.purpose ILIKE '%Branch project presentation%'
      );
    END IF;
  END IF;

  -- Attendance exemption pending HOD
  IF v_student IS NOT NULL AND to_regclass('public.student_attendance_exemptions') IS NOT NULL THEN
    INSERT INTO student_attendance_exemptions (
      tenant_id, student_user_id, reason_category, description,
      attendance_percent_at_request, semester, status
    )
    SELECT v_tenant, v_student, 'MEDICAL',
           'Hospitalization during mid-semester — attendance exemption requested for Applied Sciences student',
           62.0, 3, 'PENDING_HOD'
    WHERE NOT EXISTS (
      SELECT 1 FROM student_attendance_exemptions e
      WHERE e.student_user_id = v_student AND e.status = 'PENDING_HOD'
        AND e.description ILIKE '%Applied Sciences%'
    );
  END IF;

  -- Grievance escalation (academics category)
  IF v_student2 IS NOT NULL AND to_regclass('public.helpdesk_tickets') IS NOT NULL THEN
    INSERT INTO helpdesk_tickets (student_user_id, category, subject, description, status, assigned_to_user_id, conversation)
    SELECT v_student2, 'ACADEMICS',
           'Lab equipment grievance — Chemistry branch',
           'Chemistry lab equipment not functional for practical sessions. Escalated to HOD for resolution.',
           'PENDING', v_hod, '[]'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM helpdesk_tickets t
      WHERE t.student_user_id = v_student2 AND t.category = 'ACADEMICS'
        AND t.subject ILIKE '%Lab equipment grievance%'
    );
  END IF;

  RAISE NOTICE 'Applied Sciences HOD enhancements seeded';
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'hod.applied-sciences-staff-calendar-approvals',
  'hod',
  'gaurav.sharma@mygyanvihar.com',
  'staff_roles_academic_calendar_approvals',
  'Coordinators + calendar + branch names + approval module smoke',
  'Applied Sciences HOD feedback follow-up — July 2026'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();
