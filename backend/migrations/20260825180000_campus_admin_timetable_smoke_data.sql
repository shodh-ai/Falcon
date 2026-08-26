-- Campus Admin Timetable smoke data (admin_timetable_slots).
-- Login: campusadmin@mygyanvihar.com / password123 → /campus-admin/academics/timetable
-- Also visible via /api/admin-ops/timetable for registrar/admin-ops.

CREATE TABLE IF NOT EXISTS smoke_seed_manifest (
  smoke_key VARCHAR(120) PRIMARY KEY,
  portal VARCHAR(80) NOT NULL,
  role_email VARCHAR(255),
  feature_area VARCHAR(160) NOT NULL,
  sample_record VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SEEDED',
  notes TEXT,
  seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'campus-admin.timetable',
  'campus-admin',
  'campusadmin@mygyanvihar.com',
  'Master timetable',
  '12 weekly slots (2025-26) + 1 intentional room clash',
  'Login campusadmin@ → Academics → Timetable. Rooms A-101/A-102/LAB-CSE-1/SEM-HALL-1. Faculty1/Faculty2. Courses CSE*/0ER12.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  portal = EXCLUDED.portal,
  role_email = EXCLUDED.role_email,
  feature_area = EXCLUDED.feature_area,
  sample_record = EXCLUDED.sample_record,
  notes = EXCLUDED.notes,
  seeded_at = NOW();

DO $$
DECLARE
  v_tenant UUID;
  v_faculty1 UUID;
  v_faculty2 UUID;
  v_year TEXT := '2025-26';
  -- Fixed slot ids for idempotent re-seed
  v_s1  UUID := 'c1000001-0000-4000-8000-000000000001'::uuid;
  v_s2  UUID := 'c1000001-0000-4000-8000-000000000002'::uuid;
  v_s3  UUID := 'c1000001-0000-4000-8000-000000000003'::uuid;
  v_s4  UUID := 'c1000001-0000-4000-8000-000000000004'::uuid;
  v_s5  UUID := 'c1000001-0000-4000-8000-000000000005'::uuid;
  v_s6  UUID := 'c1000001-0000-4000-8000-000000000006'::uuid;
  v_s7  UUID := 'c1000001-0000-4000-8000-000000000007'::uuid;
  v_s8  UUID := 'c1000001-0000-4000-8000-000000000008'::uuid;
  v_s9  UUID := 'c1000001-0000-4000-8000-000000000009'::uuid;
  v_s10 UUID := 'c1000001-0000-4000-8000-000000000010'::uuid;
  v_s11 UUID := 'c1000001-0000-4000-8000-000000000011'::uuid;
  v_s12 UUID := 'c1000001-0000-4000-8000-000000000012'::uuid;
  -- Intentional room clash pair (same room/day/overlap) for conflicts UI
  v_clash_a UUID := 'c1000001-0000-4000-8000-0000000000aa'::uuid;
  v_clash_b UUID := 'c1000001-0000-4000-8000-0000000000bb'::uuid;
BEGIN
  IF to_regclass('public.admin_timetable_slots') IS NULL THEN
    RAISE NOTICE 'Skipping campus-admin timetable smoke: admin_timetable_slots missing';
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping campus-admin timetable smoke: sgvu tenant missing';
    RETURN;
  END IF;

  SELECT user_id INTO v_faculty1
  FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty1@mygyanvihar.com'
  LIMIT 1;

  SELECT user_id INTO v_faculty2
  FROM users
  WHERE tenant_id = v_tenant AND lower(official_email) = 'faculty2@mygyanvihar.com'
  LIMIT 1;

  IF v_faculty1 IS NULL THEN
    SELECT u.user_id INTO v_faculty1
    FROM users u
    WHERE u.tenant_id = v_tenant AND u.dept_id = 1 AND u.deleted_at IS NULL
    ORDER BY u.created_at NULLS LAST
    LIMIT 1;
  END IF;

  IF v_faculty2 IS NULL THEN
    SELECT u.user_id INTO v_faculty2
    FROM users u
    WHERE u.tenant_id = v_tenant
      AND u.dept_id = 1
      AND u.deleted_at IS NULL
      AND (v_faculty1 IS NULL OR u.user_id <> v_faculty1)
    ORDER BY u.created_at NULLS LAST
    LIMIT 1;
  END IF;

  IF v_faculty2 IS NULL THEN
    v_faculty2 := v_faculty1;
  END IF;

  -- Remove previous smoke slots (by fixed ids + smoke room prefix)
  DELETE FROM admin_timetable_slots
  WHERE tenant_id = v_tenant
    AND (
      slot_id IN (
        v_s1, v_s2, v_s3, v_s4, v_s5, v_s6, v_s7, v_s8, v_s9, v_s10, v_s11, v_s12,
        v_clash_a, v_clash_b
      )
      OR room_code LIKE 'SMOKE-%'
      OR (
        academic_year = v_year
        AND room_code IN ('A-101', 'A-102', 'LAB-CSE-1', 'SEM-HALL-1')
        AND course_code IN (
          'CSE102', 'CSE201', 'CSE202', 'CSE203', 'CSE301', 'CSE302', '0ER12', 'OE501'
        )
      )
    );

  INSERT INTO admin_timetable_slots (
    slot_id, tenant_id, room_code, day_of_week, start_time, end_time,
    course_code, faculty_user_id, academic_year, created_at
  ) VALUES
    -- Monday
    (v_s1,  v_tenant, 'A-101',      1, '09:00', '10:00', 'CSE102', v_faculty1, v_year, NOW() - INTERVAL '20 days'),
    (v_s2,  v_tenant, 'A-102',      1, '10:00', '11:00', 'CSE201', v_faculty2, v_year, NOW() - INTERVAL '20 days'),
    (v_s3,  v_tenant, 'LAB-CSE-1',  1, '14:00', '16:00', 'CSE302', v_faculty1, v_year, NOW() - INTERVAL '19 days'),
    -- Tuesday
    (v_s4,  v_tenant, 'A-101',      2, '09:00', '10:00', 'CSE202', v_faculty2, v_year, NOW() - INTERVAL '18 days'),
    (v_s5,  v_tenant, 'SEM-HALL-1', 2, '11:00', '12:00', '0ER12',  v_faculty1, v_year, NOW() - INTERVAL '18 days'),
    -- Wednesday
    (v_s6,  v_tenant, 'A-102',      3, '09:00', '10:00', 'CSE203', v_faculty2, v_year, NOW() - INTERVAL '17 days'),
    (v_s7,  v_tenant, 'A-101',      3, '10:00', '11:00', 'CSE301', v_faculty1, v_year, NOW() - INTERVAL '17 days'),
    (v_s8,  v_tenant, 'LAB-CSE-1',  3, '14:00', '16:00', 'CSE302', v_faculty2, v_year, NOW() - INTERVAL '16 days'),
    -- Thursday
    (v_s9,  v_tenant, 'A-101',      4, '09:00', '10:00', 'CSE201', v_faculty1, v_year, NOW() - INTERVAL '15 days'),
    (v_s10, v_tenant, 'SEM-HALL-1', 4, '11:00', '12:00', 'OE501',  v_faculty2, v_year, NOW() - INTERVAL '15 days'),
    -- Friday
    (v_s11, v_tenant, 'A-102',      5, '09:00', '10:00', 'CSE202', v_faculty1, v_year, NOW() - INTERVAL '14 days'),
    (v_s12, v_tenant, 'A-101',      5, '10:00', '11:00', 'CSE203', v_faculty2, v_year, NOW() - INTERVAL '14 days'),
    -- Intentional room conflict on Friday afternoon (conflicts panel QA)
    (v_clash_a, v_tenant, 'SMOKE-CLASH', 5, '15:00', '16:00', 'CSE301', v_faculty1, v_year, NOW() - INTERVAL '10 days'),
    (v_clash_b, v_tenant, 'SMOKE-CLASH', 5, '15:30', '16:30', '0ER12',  v_faculty2, v_year, NOW() - INTERVAL '10 days')
  ON CONFLICT (tenant_id, room_code, day_of_week, start_time, academic_year) DO UPDATE SET
    end_time = EXCLUDED.end_time,
    course_code = EXCLUDED.course_code,
    faculty_user_id = EXCLUDED.faculty_user_id,
    slot_id = EXCLUDED.slot_id;

  -- Mirror a few slots into academic_timetables for course-detail / faculty views
  IF to_regclass('public.academic_timetables') IS NOT NULL THEN
    INSERT INTO academic_timetables (
      tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id
    )
    SELECT
      v_tenant,
      c.course_id,
      s.day_of_week,
      s.start_time,
      s.end_time,
      s.room_code,
      s.faculty_user_id
    FROM admin_timetable_slots s
    JOIN academic_courses c
      ON c.tenant_id = s.tenant_id
     AND upper(trim(c.course_code)) = upper(trim(s.course_code))
     AND c.deleted_at IS NULL
    WHERE s.tenant_id = v_tenant
      AND s.slot_id IN (v_s1, v_s3, v_s5, v_s7, v_s9, v_s11)
      AND NOT EXISTS (
        SELECT 1
        FROM academic_timetables t
        WHERE t.tenant_id = v_tenant
          AND t.course_id = c.course_id
          AND t.day_of_week = s.day_of_week
          AND t.start_time = s.start_time
          AND coalesce(t.room, '') = s.room_code
      );
  END IF;

  RAISE NOTICE 'Campus Admin timetable smoke seeded for tenant % (year %)', v_tenant, v_year;
END $$;
