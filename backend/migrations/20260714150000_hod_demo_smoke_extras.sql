-- Extra demo smoke for HOD portals: profile corrections, funding, placement responses.
-- Idempotent — safe to re-run on live after merge.

DO $$
DECLARE
  cfg RECORD;
  v_tenant UUID;
  v_dept INT;
  v_hod UUID;
  v_faculty UUID;
  v_student1 UUID;
  v_student2 UUID;
  v_drive UUID;
  v_guide UUID;
  v_prefix TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOR cfg IN
    SELECT * FROM (VALUES
      ('CA', 'CA'),
      ('ISBM', 'ISBM'),
      ('Applied Sciences', 'SAS'),
      ('Mech Engg', 'MECH'),
      ('BPT', 'BPT'),
      ('GCAD', 'GCAD'),
      ('C3WR', 'C3WR'),
      ('SILS', 'SILS'),
      ('Law', 'LAW'),
      ('Education', 'EDU'),
      ('Agriculture', 'AGR'),
      ('Clinical Psychology', 'CLPSY')
    ) AS t(dept_name, prefix)
  LOOP
    v_prefix := cfg.prefix;

    SELECT dept_id, hod_user_id INTO v_dept, v_hod
    FROM departments
    WHERE dept_name = cfg.dept_name
    LIMIT 1;

    IF v_dept IS NULL OR v_hod IS NULL THEN
      CONTINUE;
    END IF;

    SELECT user_id INTO v_faculty
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Faculty' AND u.user_id <> v_hod
    ORDER BY u.name
    LIMIT 1;

    SELECT user_id INTO v_student1
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Student'
    ORDER BY u.name
    LIMIT 1 OFFSET 0;

    SELECT user_id INTO v_student2
    FROM users u
    JOIN roles r ON r.role_id = u.role_id
    WHERE u.dept_id = v_dept AND r.role_name = 'Student'
    ORDER BY u.name
    LIMIT 1 OFFSET 1;

    -- Profile correction ticket (HOD approvals + command center count)
    IF v_student1 IS NOT NULL AND to_regclass('public.helpdesk_tickets') IS NOT NULL THEN
      INSERT INTO helpdesk_tickets (
        student_user_id, category, subject, description, status, assigned_to_user_id, conversation
      )
      SELECT
        v_student1,
        'STUDENT_PROFILE',
        cfg.dept_name || ' profile correction — demo',
        'Please update my phone number and permanent address on the student portal.',
        'PENDING',
        v_hod,
        '[]'::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM helpdesk_tickets t
        JOIN users u ON u.user_id = t.student_user_id
        WHERE u.dept_id = v_dept
          AND t.category = 'STUDENT_PROFILE'
          AND t.status = 'PENDING'
          AND t.subject ILIKE '%demo%'
      );
    END IF;

    -- Pending faculty leave (inbox widget)
    IF v_faculty IS NOT NULL AND to_regclass('public.staff_leave_requests') IS NOT NULL THEN
      INSERT INTO staff_leave_requests (
        tenant_id, staff_user_id, leave_type, start_date, end_date, reason, status
      )
      SELECT
        v_tenant, v_faculty, 'CASUAL', CURRENT_DATE + 3, CURRENT_DATE + 3,
        cfg.dept_name || ' demo leave — pending HOD approval', 'PENDING'
      WHERE NOT EXISTS (
        SELECT 1 FROM staff_leave_requests
        WHERE staff_user_id = v_faculty
          AND reason ILIKE '%demo leave%'
          AND status = 'PENDING'
      );
    END IF;

    -- Placement drive responses
    IF to_regclass('public.hod_dept_placement_responses') IS NOT NULL THEN
      SELECT drive_id INTO v_drive
      FROM hod_dept_placement_drives
      WHERE tenant_id = v_tenant AND dept_id = v_dept AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_drive IS NOT NULL AND v_student1 IS NOT NULL THEN
        INSERT INTO hod_dept_placement_responses (
          drive_id, tenant_id, student_user_id, student_name, student_email,
          enrollment_no, phone, response_json
        )
        SELECT
          v_drive, v_tenant, v_student1, u.name, u.official_email,
          sp.enrollment_no, sp.phone,
          jsonb_build_object('source', 'PORTAL', 'demo', true)
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
        WHERE u.user_id = v_student1
          AND NOT EXISTS (
            SELECT 1 FROM hod_dept_placement_responses r
            WHERE r.drive_id = v_drive AND r.student_user_id = v_student1
          );

        IF v_student2 IS NOT NULL THEN
          INSERT INTO hod_dept_placement_responses (
            drive_id, tenant_id, student_user_id, student_name, student_email,
            enrollment_no, phone, response_json
          )
          SELECT
            v_drive, v_tenant, v_student2, u.name, u.official_email,
            sp.enrollment_no, sp.phone,
            jsonb_build_object('source', 'PORTAL', 'demo', true)
          FROM users u
          LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
          WHERE u.user_id = v_student2
            AND NOT EXISTS (
              SELECT 1 FROM hod_dept_placement_responses r
              WHERE r.drive_id = v_drive AND r.student_user_id = v_student2
            );
        END IF;
      END IF;
    END IF;

    -- Project funding request pending HOD approval
    IF v_faculty IS NOT NULL
       AND to_regclass('public.faculty_project_guides') IS NOT NULL
       AND to_regclass('public.project_funding_requests') IS NOT NULL THEN
      SELECT guide_id INTO v_guide
      FROM faculty_project_guides
      WHERE tenant_id = v_tenant AND faculty_user_id = v_faculty
        AND project_title ILIKE '%' || cfg.dept_name || '%demo%'
      LIMIT 1;

      IF v_guide IS NULL THEN
        INSERT INTO faculty_project_guides (
          tenant_id, faculty_user_id, project_title, program, status,
          start_date, funding_allocated, funding_consumed
        )
        VALUES (
          v_tenant, v_faculty,
          cfg.dept_name || ' Capstone Project — demo',
          cfg.dept_name || ' Program',
          'ACTIVE',
          CURRENT_DATE - 14,
          25000.00,
          5000.00
        )
        RETURNING guide_id INTO v_guide;
      END IF;

      IF v_guide IS NOT NULL THEN
        INSERT INTO project_funding_requests (
          tenant_id, guide_id, requested_by, amount, purpose, status, hod_user_id
        )
        SELECT
          v_tenant, v_guide, v_faculty, 8500.00,
          'Lab consumables and prototype materials for ' || cfg.dept_name || ' capstone demo',
          'PENDING_HOD',
          v_hod
        WHERE NOT EXISTS (
          SELECT 1 FROM project_funding_requests fr
          WHERE fr.guide_id = v_guide AND fr.status = 'PENDING_HOD'
        );
      END IF;
    END IF;

    RAISE NOTICE 'Seeded HOD demo extras for %', cfg.dept_name;
  END LOOP;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'hod.all-departments-demo-extras',
  'hod',
  'anil.pal@mygyanvihar.com',
  'profile_corrections_funding_placement',
  'Profile ticket + leave + placement responses + funding per dept',
  'Demo polish for HOD portal presentation before live deploy'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();
