-- Re-run ME student login seed when the original migration no-opped (missing entity/dept).
-- Fails loudly if zero accounts are upserted so prod db:migrate cannot silently skip.

DO $$
DECLARE
  v_tenant UUID;
  v_dept INT;
  v_entity INT;
  v_role INT;
  v_hash VARCHAR := '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
  v_user UUID;
  v_count INT := 0;
  rec RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Student') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Student', 'Application role for Student portal access');
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1;
  SELECT dept_id INTO v_dept
  FROM departments
  WHERE dept_name IN ('Mech Engg', 'Mechanical Engineering')
  ORDER BY CASE dept_name WHEN 'Mech Engg' THEN 0 ELSE 1 END
  LIMIT 1;
  SELECT role_id INTO v_role FROM roles WHERE role_name = 'Student' LIMIT 1;

  SELECT entity_id INTO v_entity
  FROM org_entities
  WHERE tenant_id = v_tenant
    AND is_active = true
    AND entity_code = 'SGVU_UNIVERSITY'
  LIMIT 1;

  IF v_entity IS NULL AND v_tenant IS NOT NULL THEN
    SELECT entity_id INTO v_entity
    FROM org_entities
    WHERE tenant_id = v_tenant AND is_active = true
    ORDER BY entity_id
    LIMIT 1;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ME student seed rerun: sgvu tenant not found';
  END IF;
  IF v_dept IS NULL THEN
    RAISE EXCEPTION 'ME student seed rerun: Mech Engg department not found';
  END IF;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ME student seed rerun: Student role not found';
  END IF;
  IF v_entity IS NULL THEN
    RAISE EXCEPTION 'ME student seed rerun: no active org_entity for sgvu';
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('KAMAR SAKIB KHAN', 'sakib.23183493@mygyanvihar.com', 7, 'A', 'B.Tech Mechanical Engineering', '23183493'),
      ('MUKESH  KUMAR', 'mukesh.23181893@mygyanvihar.com', 7, 'A', 'B.Tech Mechanical Engineering', '23181893'),
      ('NITISH  KUMAR', 'nitish.23181270@mygyanvihar.com', 7, 'A', 'B.Tech Mechanical Engineering', '23181270'),
      ('YASH  SINGH', 'yash.23180717@mygyanvihar.com', 7, 'A', 'B.Tech Mechanical Engineering', '23180717'),
      ('RAVI  KUMAR', 'ravi.2345541@mygyanvihar.com', 7, 'A', 'B.Tech Mechanical Engineering', '2345541'),
      ('Sandeep  Kumar', 'sandeep.2456437@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2456437'),
      ('Sourabh  Kumar', 'sourabh.2456436@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2456436'),
      ('Raviraj  Kumar', 'raviraj.2455903@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2455903'),
      ('SUNIL   KUMAR', 'sunil.2455672@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2455672'),
      ('JAID  KHAN', 'jaid.2455159@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2455159'),
      ('RAJNISH  KUMAR', 'rajnish.2454556@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2454556'),
      ('ABHISHEK KUMAR   RANJAN', 'abhishek.2453220@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2453220'),
      ('Md Guljar  Ansari', 'md.2452746@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2452746'),
      ('SAJAN KHAN', 'sajan.2452429@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2452429'),
      ('MINHAZ RAZA', 'minhaz.2452395@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2452395'),
      ('Prince   Pandey', 'prince.2449447@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2449447'),
      ('SHUBHAM   KUMAR', 'shubham.2448945@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2448945'),
      ('Manish  Kumar', 'manish.2448390@mygyanvihar.com', 5, 'A', 'B.Tech Mechanical Engineering', '2448390'),
      ('Aryan Sharma', 'aryan.2455698@mygyanvihar.com', 7, 'A', 'B.Tech Lateral Entry Mechanical Engineering', '2455698'),
      ('Shubham Kumar  Singh', 'shubham.2551323@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2551323'),
      ('Shajid   Khan', 'shajid.2550814@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2550814'),
      ('Shivam   Kumar', 'shivam.2550776@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2550776'),
      ('Jalaj  Bansal', 'jalaj.2550454@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2550454'),
      ('Anshuman Singh', 'anshuman.2549873@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2549873'),
      ('MD  Kaif Khan', 'md.2549366@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2549366'),
      ('RAVI   PRAKASH', 'ravi.2549361@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2549361'),
      ('Irfan  Khan', 'irfan.2549194@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2549194'),
      ('Vikas  Kumar', 'vikas.2548899@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2548899'),
      ('SHIVAM KUMAR SINGH', 'shivam.2548866@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2548866'),
      ('Amarjit  Kumar', 'amarjit.2548858@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2548858'),
      ('Yashika  Soni', 'yashika.2548821@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2548821'),
      ('MANSUN   Raj', 'mansun.2547576@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547576'),
      ('Lalit   Lakhera', 'lalit.2547526@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547526'),
      ('Viraj  Raghuwanshi', 'viraj.2547455@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547455'),
      ('REYAN   Khan', 'reyan.2547378@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547378'),
      ('Bitu   Kumar', 'bitu.2547358@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547358'),
      ('Ujjawal  Kumar', 'ujjawal.2547282@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547282'),
      ('Tanweer  Alam', 'tanweer.2547118@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2547118'),
      ('MD  SHAHNAWAJ AHMAD', 'md.2546955@mygyanvihar.com', 3, 'A', 'B.Tech Mechanical Engineering', '2546955')
    ) AS t(name, email, semester, section_code, batch, enrollment_no)
  LOOP
    SELECT user_id INTO v_user
    FROM users
    WHERE tenant_id = v_tenant AND lower(official_email) = lower(rec.email)
    LIMIT 1;

    IF v_user IS NULL THEN
      INSERT INTO users (
        tenant_id, name, official_email, role_id, dept_id, entity_id,
        password_hash, is_active, onboarding_status, onboarding_profile
      ) VALUES (
        v_tenant, rec.name, lower(rec.email), v_role, v_dept, v_entity,
        v_hash, true, 'COMPLETED', '{}'::jsonb
      )
      RETURNING user_id INTO v_user;
    ELSE
      UPDATE users SET
        name = rec.name,
        dept_id = v_dept,
        entity_id = v_entity,
        role_id = v_role,
        password_hash = v_hash,
        is_active = true,
        onboarding_status = 'COMPLETED',
        updated_at = NOW()
      WHERE user_id = v_user;
    END IF;

    INSERT INTO student_profiles (
      tenant_id, user_id, prn_number, enrollment_no, batch, current_semester, section_code, status
    ) VALUES (
      v_tenant, v_user, rec.enrollment_no, rec.enrollment_no, rec.batch, rec.semester, rec.section_code, 'ACTIVE'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      batch = EXCLUDED.batch,
      current_semester = EXCLUDED.current_semester,
      section_code = EXCLUDED.section_code,
      enrollment_no = COALESCE(student_profiles.enrollment_no, EXCLUDED.enrollment_no),
      prn_number = COALESCE(student_profiles.prn_number, EXCLUDED.prn_number),
      status = 'ACTIVE',
      updated_at = NOW();

    INSERT INTO user_roles (user_id, role_id, is_primary)
    VALUES (v_user, v_role, true)
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  IF v_count < 39 THEN
    RAISE EXCEPTION 'ME student seed rerun: expected 39 students, upserted %', v_count;
  END IF;

  RAISE NOTICE 'ME student seed rerun: upserted % student login accounts', v_count;
END $$;

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'mechanical.students-login-rerun',
  'student',
  'yashika.2548821@mygyanvihar.com',
  'Mechanical student portal logins',
  '39 ME students · password123',
  'Rerun ME login seed with strict prerequisites; fails if zero accounts created.'
)
ON CONFLICT (smoke_key) DO UPDATE SET
  notes = EXCLUDED.notes,
  seeded_at = NOW();
