-- Semester-I Pharmacy student onboarding from the approved admissions extract.
-- Source: 2026 Students (1).xls (SHA-256: 4759dae54192010eca8207707ac6dc299c882e5172c6eca6bc1c9c7f5b02c5ca)
-- 151 eligible students (48 D.Pharm, 100 B.Pharm incl. 5 lateral, 3 M.Pharm).
-- One rejected/incomplete row (SID 2646383) is intentionally excluded.
-- No source email addresses or plaintext passwords are imported.
-- Login identity is student_profiles.student_login_id (the source SID).

BEGIN;

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS student_login_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS enrollment_number VARCHAR(80),
  ADD COLUMN IF NOT EXISTS program_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS admission_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS admission_status VARCHAR(30);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_profiles_tenant_login_id
  ON student_profiles (tenant_id, student_login_id)
  WHERE student_login_id IS NOT NULL AND BTRIM(student_login_id) <> '';

CREATE TABLE IF NOT EXISTS student_migration_manifest (
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  source_file_name VARCHAR(255) NOT NULL,
  source_file_sha256 VARCHAR(64) NOT NULL,
  eligible_count INTEGER NOT NULL,
  excluded_count INTEGER NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, source_file_sha256)
);

DO $$
DECLARE
  v_tenant UUID;
  v_dept INTEGER;
  v_role INTEGER;
  v_entity INTEGER;
  v_count INTEGER;
  v_enrollment_count INTEGER;
  v_profile_count INTEGER;
  v_expected_enrollment_count INTEGER;
  v_user UUID;
  v_existing_count INTEGER;
  rec RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.tenants
  WHERE subdomain = 'sgvu' AND is_active = true
  LIMIT 1;

  SELECT dept_id INTO v_dept
  FROM departments
  WHERE lower(dept_name) = 'pharmacy' AND deleted_at IS NULL
  ORDER BY dept_id
  LIMIT 1;

  SELECT role_id INTO v_role FROM roles WHERE role_name = 'Student' LIMIT 1;

  SELECT COALESCE(
    (SELECT entity_id FROM org_entities
     WHERE tenant_id = v_tenant AND entity_code = 'SGVU_UNIVERSITY' AND is_active = true LIMIT 1),
    (SELECT entity_id FROM org_entities
     WHERE tenant_id = v_tenant AND is_active = true ORDER BY entity_id LIMIT 1)
  ) INTO v_entity;

  IF v_tenant IS NULL OR v_dept IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Pharmacy student onboarding prerequisites missing (tenant %, dept %, role %)', v_tenant, v_dept, v_role;
  END IF;

  CREATE TEMP TABLE pharmacy_sem1_students (
    student_login_id VARCHAR(80) PRIMARY KEY,
    student_name TEXT NOT NULL,
    program_name VARCHAR(200) NOT NULL,
    admission_type VARCHAR(30) NOT NULL,
    enrollment_number VARCHAR(80) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pharmacy_sem1_students(student_login_id, student_name, program_name, admission_type, enrollment_number)
  VALUES
  ('2650799', 'Hansraj Yadav', 'D.Pharm', 'REGULAR', '202630000977'),
  ('2650779', 'Samay Bairwa', 'D.Pharm', 'REGULAR', '202630001015'),
  ('2650768', 'Bhupendra Kumar Meena', 'D.Pharm', 'REGULAR', '202630000978'),
  ('2650155', 'Ashish Kumar Meena', 'D.Pharm', 'REGULAR', '202630000856'),
  ('2650047', 'vartika verma', 'B.Pharm', 'REGULAR', '202630100828'),
  ('2650001', 'Lokesh Meena', 'D.Pharm', 'REGULAR', '202630000767'),
  ('2649970', 'Ms. Parul Meena', 'D.Pharm', 'REGULAR', '202630000770'),
  ('2649505', 'NITESH KUMAR', 'D.Pharm', 'REGULAR', '202630000087'),
  ('2649248', 'Keshav gehlot', 'B.Pharm', 'REGULAR', '202630100854'),
  ('2649247', 'Nisha Yadav', 'B.Pharm', 'REGULAR', '202630100853'),
  ('2649242', 'Dilkush chopdar', 'B.Pharm', 'REGULAR', '202630100859'),
  ('2649157', 'Mahesh Kumar Gurjar', 'D.Pharm', 'REGULAR', '202630000115'),
  ('2649125', 'simran bhatia', 'D.Pharm', 'REGULAR', '202630000118'),
  ('2648734', 'Siddhesh', 'D.Pharm', 'REGULAR', '202630000150'),
  ('2648688', 'Aashish lalawat', 'D.Pharm', 'REGULAR', '202630000156'),
  ('2648497', 'Niraj Kumar Bairwa', 'D.Pharm', 'REGULAR', '202630000190'),
  ('2648461', 'Abhishek Sharma', 'D.Pharm', 'REGULAR', '202630000201'),
  ('2648386', 'Alok Ghusingha', 'D.Pharm', 'REGULAR', '202630000209'),
  ('2648313', 'Naresh Meena', 'D.Pharm', 'REGULAR', '202630000228'),
  ('2648278', 'July Adhikary', 'B.Pharm', 'LATERAL', '202630300234'),
  ('2648276', 'rohit sharma', 'D.Pharm', 'REGULAR', '202630000714'),
  ('2648273', 'gulshan sharma', 'D.Pharm', 'REGULAR', '202630000236'),
  ('2648231', 'Suraj', 'D.Pharm', 'REGULAR', '202630000244'),
  ('2648196', 'subrat Debnath', 'M.Pharm Pharmaceutics', 'REGULAR', '202630200255'),
  ('2648036', 'Jaideep', 'D.Pharm', 'REGULAR', '202630000296'),
  ('2648026', 'sawan swami', 'D.Pharm', 'REGULAR', '202630000298'),
  ('2648002', 'Ankit Prajapat', 'B.Pharm', 'REGULAR', '202630100301'),
  ('2647985', 'Mohit Kuntal', 'D.Pharm', 'REGULAR', '202630000303'),
  ('2647887', 'Prince', 'B.Pharm', 'REGULAR', '202630100321'),
  ('2647886', 'MOHAMMED SAMEER SOLANKI', 'B.Pharm', 'REGULAR', '202630100322'),
  ('2647876', 'ABHILESH GAHAN', 'D.Pharm', 'REGULAR', '202630001067'),
  ('2647854', 'Nikhil Sahu', 'B.Pharm', 'REGULAR', '202630100329'),
  ('2647821', 'Yug Sahu', 'B.Pharm', 'REGULAR', '202630100332'),
  ('2647810', 'KANHAIYA KUMAR', 'B.Pharm', 'REGULAR', '202630100993'),
  ('2647806', 'Radhika Saini', 'B.Pharm', 'REGULAR', '202630100334'),
  ('2647784', 'HITESH MINA', 'B.Pharm', 'REGULAR', '202630100339'),
  ('2647765', 'Mohit Yadav', 'B.Pharm', 'REGULAR', '202630100343'),
  ('2647747', 'Armeen', 'B.Pharm', 'REGULAR', '202630100345'),
  ('2647736', 'Jahnvi Mahawar', 'B.Pharm', 'REGULAR', '202630100347'),
  ('2647697', 'Ankit Bairwa', 'B.Pharm', 'REGULAR', '202630100914'),
  ('2647690', 'Rohan Kumar', 'B.Pharm', 'REGULAR', '202630100359'),
  ('2647653', 'ANKIT CHOUDHARY', 'D.Pharm', 'REGULAR', '202630000367'),
  ('2647635', 'Sahil Khan', 'D.Pharm', 'REGULAR', '202630000735'),
  ('2647634', 'Sajid', 'D.Pharm', 'REGULAR', '202630000372'),
  ('2647612', 'moin khan', 'D.Pharm', 'REGULAR', '202630000377'),
  ('2647611', 'firoj khan', 'D.Pharm', 'REGULAR', '202630000912'),
  ('2647592', 'SHIVAM PRAJAPATI', 'B.Pharm', 'REGULAR', '202630100379'),
  ('2647589', 'Namrita chauhan', 'B.Pharm', 'REGULAR', '202630100380'),
  ('2647587', 'Mihir Abhesingbhai rathava', 'B.Pharm', 'REGULAR', '202630100382'),
  ('2647586', 'Nikhil', 'B.Pharm', 'REGULAR', '202630100383'),
  ('2647583', 'Parth Bagra', 'B.Pharm', 'REGULAR', '202630100385'),
  ('2647581', 'Dev Kumar Jain', 'B.Pharm', 'REGULAR', '202630100386'),
  ('2647526', 'Ashish kumar', 'B.Pharm', 'REGULAR', '202630100395'),
  ('2647475', 'Aryan Nitharwal', 'B.Pharm', 'REGULAR', '202630100412'),
  ('2647460', 'Harsh kumar rajoriya', 'B.Pharm', 'REGULAR', '202630100418'),
  ('2647443', 'harimohan meena', 'B.Pharm', 'REGULAR', '202630100422'),
  ('2647364', 'Ankur raj', 'B.Pharm', 'REGULAR', '202630100429'),
  ('2647363', 'ADITYA KUMAR', 'B.Pharm', 'REGULAR', '202630100430'),
  ('2647338', 'Harsh Sharma', 'B.Pharm', 'REGULAR', '202630100431'),
  ('2647327', 'Hari shankar saini', 'B.Pharm', 'REGULAR', '202630100434'),
  ('2647302', 'Omveer Gurjar', 'D.Pharm', 'REGULAR', '202630000438'),
  ('2647298', 'Akshat Srivastava', 'M.Pharm Pharmaceutics', 'REGULAR', '202630200440'),
  ('2647267', 'Khushiram Saini', 'D.Pharm', 'REGULAR', '202630000448'),
  ('2647242', 'Swarit Shukla', 'B.Pharm', 'REGULAR', '202630100451'),
  ('2647219', 'Chetan', 'B.Pharm', 'REGULAR', '202630100454'),
  ('2647216', 'Abhijeet sharma', 'B.Pharm', 'REGULAR', '202630100457'),
  ('2647191', 'Ayush Sharma', 'B.Pharm', 'REGULAR', '202630100462'),
  ('2647189', 'Naitik Sisodiya', 'B.Pharm', 'REGULAR', '202630100463'),
  ('2647186', 'MANAV AGARWAL', 'B.Pharm', 'REGULAR', '202630100464'),
  ('2647184', 'angel Pareek', 'B.Pharm', 'REGULAR', '202630100924'),
  ('2647182', 'Yuvraj Singh', 'B.Pharm', 'REGULAR', '202630100465'),
  ('2647175', 'Akshay Meena', 'B.Pharm', 'REGULAR', '202630100466'),
  ('2647157', 'Rudraksh Gaur', 'B.Pharm', 'REGULAR', '202630100467'),
  ('2647156', 'Aditya Gaur', 'D.Pharm', 'REGULAR', '202630000468'),
  ('2647153', 'Satyam Additya', 'D.Pharm', 'REGULAR', '202630000926'),
  ('2647132', 'Aditya Solanki', 'B.Pharm', 'REGULAR', '202630100471'),
  ('2647114', 'Manish Kumar Bairwa', 'B.Pharm', 'REGULAR', '202630100473'),
  ('2647096', 'Astha Soni', 'B.Pharm', 'REGULAR', '202630100477'),
  ('2647088', 'Karan Dagar', 'B.Pharm', 'REGULAR', '202630100479'),
  ('2647043', 'ROHIT YADAV', 'B.Pharm', 'REGULAR', '202630100485'),
  ('2647028', 'Tanmay Sharma', 'B.Pharm', 'REGULAR', '202630100488'),
  ('2647019', 'Parveen kumar Jatwa', 'B.Pharm', 'REGULAR', '202630100491'),
  ('2646977', 'sarthak singh', 'B.Pharm', 'REGULAR', '202630100497'),
  ('2646950', 'SUNIL KUMAR SAMOTA', 'B.Pharm', 'REGULAR', '202630100501'),
  ('2646935', 'SUNNY KUMAR', 'B.Pharm', 'REGULAR', '202630100504'),
  ('2646933', 'GAURAV KUMAR', 'B.Pharm', 'REGULAR', '202630100505'),
  ('2646932', 'AMAN KUMAR', 'B.Pharm', 'REGULAR', '202630100506'),
  ('2646931', 'Brajesh Kumar', 'B.Pharm', 'REGULAR', '202630100507'),
  ('2646885', 'Sumit Choudhary', 'D.Pharm', 'REGULAR', '202630000511'),
  ('2646874', 'Rahul saini', 'B.Pharm', 'REGULAR', '202630100514'),
  ('2646833', 'Pushpendra Singh poonia', 'B.Pharm', 'REGULAR', '202630100515'),
  ('2646744', 'Pavan Kumar Bairwa', 'D.Pharm', 'REGULAR', '202630000523'),
  ('2646725', 'Archita Pathak', 'D.Pharm', 'REGULAR', '202630000529'),
  ('2646724', 'Mohd Rihan', 'D.Pharm', 'REGULAR', '202630000530'),
  ('2646723', 'Aman Sharma', 'D.Pharm', 'REGULAR', '202630000531'),
  ('2646613', 'Dilkhush Gurjar', 'B.Pharm', 'REGULAR', '202630100538'),
  ('2646612', 'Vansh Sharma', 'B.Pharm', 'REGULAR', '202630100539'),
  ('2646584', 'Vikash', 'B.Pharm', 'REGULAR', '202630100543'),
  ('2646578', 'Zaheer khan', 'D.Pharm', 'REGULAR', '202630000546'),
  ('2646547', 'Gourav Dahiya', 'B.Pharm', 'REGULAR', '202630100554'),
  ('2646531', 'Aayush', 'B.Pharm', 'REGULAR', '202630100556'),
  ('2646515', 'Omendra Kumar Sharma', 'D.Pharm', 'REGULAR', '202630000559'),
  ('2646514', 'Sandeep Kumar Saraswat', 'D.Pharm', 'REGULAR', '202630000560'),
  ('2646501', 'Kamlesh verma', 'M.Pharm Pharmaceutics', 'REGULAR', '202630200562'),
  ('2646454', 'Kartik Singh', 'B.Pharm', 'REGULAR', '202630100570'),
  ('2646453', 'Ankita', 'B.Pharm', 'LATERAL', '202630300571'),
  ('2646445', 'Rahul Sharma', 'D.Pharm', 'REGULAR', '202630000572'),
  ('2646418', 'SULTAN ANSARI', 'B.Pharm', 'REGULAR', '202630100575'),
  ('2646417', 'ATIF JAWED', 'B.Pharm', 'REGULAR', '202630100576'),
  ('2646382', 'Jatin Kumar Tarani', 'B.Pharm', 'REGULAR', '202630100582'),
  ('2646363', 'Daksh jain', 'B.Pharm', 'REGULAR', '202630100583'),
  ('2646356', 'sameer sharma', 'D.Pharm', 'REGULAR', '202630000584'),
  ('2646355', 'Deepak Sharma', 'D.Pharm', 'REGULAR', '202630000585'),
  ('2646309', 'Priyanshu Sharma', 'B.Pharm', 'REGULAR', '202630100595'),
  ('2646303', 'sarthak singh', 'B.Pharm', 'REGULAR', '202630100597'),
  ('2646270', 'NIRMA', 'B.Pharm', 'REGULAR', '202630100604'),
  ('2646233', 'Shivanshu Singh', 'D.Pharm', 'REGULAR', '202630000060'),
  ('2646229', 'Shankar lal Sharma', 'B.Pharm', 'REGULAR', '202630100646'),
  ('2646218', 'Deepanshu Bainada', 'B.Pharm', 'REGULAR', '202630100645'),
  ('2646217', 'Tinu saini', 'B.Pharm', 'REGULAR', '202630100056'),
  ('2646216', 'Vivek saini', 'B.Pharm', 'REGULAR', '202630100055'),
  ('2646200', 'labhansh Gaur', 'B.Pharm', 'REGULAR', '202630100644'),
  ('2646196', 'Laxita kachhawa', 'B.Pharm', 'REGULAR', '202630100610'),
  ('2646194', 'Madhusneha Chaki', 'B.Pharm', 'REGULAR', '202630100052'),
  ('2646188', 'Lavesh sharma', 'B.Pharm', 'REGULAR', '202630100050'),
  ('2646123', 'Manuj Meena', 'B.Pharm', 'REGULAR', '202630100046'),
  ('2646111', 'Sanidhya Paliwal', 'B.Pharm', 'REGULAR', '202630100043'),
  ('2646097', 'DANISH RAJA', 'B.Pharm', 'REGULAR', '202630100643'),
  ('2646065', 'IRFAN ANSARI', 'B.Pharm', 'REGULAR', '202630100640'),
  ('2646043', 'Lokesh', 'D.Pharm', 'REGULAR', '202630000041'),
  ('2646039', 'SAURABH JAISWAL', 'B.Pharm', 'REGULAR', '202630101061'),
  ('2646013', 'Nikky', 'D.Pharm', 'REGULAR', '202630000039'),
  ('2646007', 'RAVISHANKAR ROY', 'B.Pharm', 'REGULAR', '202630100037'),
  ('2645983', 'Md SAQIB Reza', 'B.Pharm', 'REGULAR', '202630100638'),
  ('2645981', 'Raunak Kumar', 'B.Pharm', 'REGULAR', '202630100032'),
  ('2645970', 'Jayesh', 'B.Pharm', 'REGULAR', '202630100031'),
  ('2645967', 'YASHVARDHAN SINGH', 'B.Pharm', 'LATERAL', '202630300029'),
  ('2645951', 'ABHIMANYU', 'B.Pharm', 'REGULAR', '202630100028'),
  ('2645915', 'Nitin', 'B.Pharm', 'LATERAL', '202630300636'),
  ('2645836', 'jayesh khandelwal', 'B.Pharm', 'REGULAR', '202630100018'),
  ('2645800', 'pradeep', 'B.Pharm', 'LATERAL', '202630300633'),
  ('2645735', 'CHHOTU KUMAR', 'B.Pharm', 'REGULAR', '202630101059'),
  ('2645652', 'TABREZ AHAMAD', 'B.Pharm', 'REGULAR', '202630100627'),
  ('2645630', 'Rishika Singh Sengar', 'B.Pharm', 'REGULAR', '202630100625'),
  ('2645607', 'Nikita kanwar', 'B.Pharm', 'REGULAR', '202630100014'),
  ('2645538', 'Yasib', 'D.Pharm', 'REGULAR', '202630000012'),
  ('2645486', 'Kiran Meena', 'B.Pharm', 'REGULAR', '202630100619'),
  ('2645312', 'Nitesh Gurjar', 'D.Pharm', 'REGULAR', '202630000616'),
  ('2645311', 'Gourav Yadav', 'D.Pharm', 'REGULAR', '202630000615'),
  ('2645253', 'Alok Kumar', 'B.Pharm', 'REGULAR', '202630100906'),
  ('2645179', 'Sapna payla', 'B.Pharm', 'REGULAR', '202630100002');

  SELECT COUNT(*) INTO v_count FROM pharmacy_sem1_students;
  IF v_count <> 151 THEN
    RAISE EXCEPTION 'Expected 151 eligible Pharmacy students, found %', v_count;
  END IF;

  -- Resolve by the stable SID first, then by the deterministic placeholder
  -- address. This makes reruns safe even if an administrator has already
  -- replaced a pending placeholder with the student's university address.
  FOR rec IN SELECT * FROM pharmacy_sem1_students LOOP
    v_user := NULL;
    SELECT sp.user_id INTO v_user
    FROM student_profiles sp
    WHERE sp.tenant_id = v_tenant
      AND sp.student_login_id = rec.student_login_id
    LIMIT 1;

    IF v_user IS NULL THEN
      SELECT COUNT(*), MIN(sp.user_id::text)::UUID INTO v_existing_count, v_user
      FROM student_profiles sp
      WHERE sp.tenant_id = v_tenant
        AND sp.enrollment_no = rec.enrollment_number;
      IF v_existing_count > 1 THEN
        RAISE EXCEPTION 'Ambiguous existing enrollment number %', rec.enrollment_number;
      END IF;
    END IF;

    IF v_user IS NULL THEN
      SELECT u.user_id INTO v_user
      FROM users u
      WHERE u.tenant_id = v_tenant
      AND lower(u.official_email) = lower('student.' || rec.student_login_id || '@pending.invalid')
      LIMIT 1;
    END IF;

    IF v_user IS NULL THEN
      INSERT INTO users (
        tenant_id, name, official_email, role_id, dept_id, entity_id,
        password_hash, is_active, onboarding_status, onboarding_profile,
        account_status, deleted_at, updated_at
      ) VALUES (
        v_tenant, rec.student_name,
        'student.' || rec.student_login_id || '@pending.invalid',
        v_role, v_dept, v_entity, NULL, true, 'PENDING_PASSWORD_RESET',
        jsonb_build_object(
          'student_login_id', rec.student_login_id,
          'email_pending', true,
          'source', '2026 Students (1).xls'
        ),
        'PASSWORD_RESET_REQUIRED', NULL, NOW()
      )
      RETURNING user_id INTO v_user;
    ELSE
      -- Never revive an inactive identity, overwrite another role/department,
      -- or send an already-onboarded student back through onboarding on retry.
      IF NOT EXISTS (
        SELECT 1 FROM users u
        WHERE u.user_id = v_user AND u.tenant_id = v_tenant
          AND u.role_id = v_role AND u.dept_id = v_dept
          AND u.is_active = true AND u.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Existing account for SID % requires manual identity reconciliation', rec.student_login_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM student_profiles sp
        WHERE sp.user_id = v_user
          AND (
            sp.tenant_id IS DISTINCT FROM v_tenant
            OR (sp.student_login_id IS NOT NULL AND sp.student_login_id <> rec.student_login_id)
            OR (sp.enrollment_no IS NOT NULL AND sp.enrollment_no <> rec.enrollment_number)
            OR (sp.current_semester IS NOT NULL AND sp.current_semester <> 1)
            OR sp.deleted_at IS NOT NULL
            OR UPPER(COALESCE(sp.status, 'ACTIVE')) <> 'ACTIVE'
          )
      ) THEN
        RAISE EXCEPTION 'Existing profile for SID % conflicts with the source; no overwrite performed', rec.student_login_id;
      END IF;
      UPDATE users
      SET name = rec.student_name,
          entity_id = COALESCE(v_entity, entity_id),
          onboarding_profile = COALESCE(onboarding_profile, '{}'::jsonb)
            || jsonb_build_object(
              'student_login_id', rec.student_login_id,
              'email_pending', official_email LIKE '%@pending.invalid',
              'source', '2026 Students (1).xls'
            ),
          updated_at = NOW()
      WHERE user_id = v_user;
    END IF;

    INSERT INTO student_profiles (
      tenant_id, user_id, student_login_id, prn_number, enrollment_no,
      enrollment_number, batch, current_semester, section_code, program_name,
      admission_type, admission_status, status
    ) VALUES (
      v_tenant, v_user, rec.student_login_id, NULL,
      rec.enrollment_number, rec.enrollment_number, rec.program_name, 1,
      NULL, rec.program_name, rec.admission_type, 'ACTIVE', 'ACTIVE'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      student_login_id = EXCLUDED.student_login_id,
      prn_number = COALESCE(student_profiles.prn_number, EXCLUDED.prn_number),
      enrollment_no = EXCLUDED.enrollment_no,
      enrollment_number = EXCLUDED.enrollment_number,
      batch = EXCLUDED.batch,
      current_semester = EXCLUDED.current_semester,
      program_name = EXCLUDED.program_name,
      admission_type = EXCLUDED.admission_type,
      admission_status = 'ACTIVE',
      status = 'ACTIVE',
      deleted_at = NULL,
      updated_at = NOW();

    INSERT INTO user_roles(user_id, role_id, is_primary)
    VALUES (v_user, v_role, true)
    ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true;
  END LOOP;

  INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, section_code, status)
  SELECT DISTINCT v_tenant, u.user_id, a.course_id, 1, sp.section_code, 'ENROLLED'
  FROM pharmacy_sem1_students s
  JOIN student_profiles sp ON sp.tenant_id = v_tenant AND sp.student_login_id = s.student_login_id
  JOIN users u ON u.user_id = sp.user_id AND u.tenant_id = v_tenant
  JOIN academic_course_allocations a ON a.tenant_id = v_tenant
    AND a.status = 'ACTIVE' AND a.academic_year = '2026-2027'
    AND a.semester = 'I' AND a.course_id IS NOT NULL
    AND a.program_name = s.program_name
  ON CONFLICT (tenant_id, student_user_id, course_id) DO UPDATE SET
    semester = 1, section_code = COALESCE(student_course_enrollments.section_code, EXCLUDED.section_code),
    status = CASE WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status ELSE 'ENROLLED' END;

  SELECT COUNT(*) INTO v_enrollment_count
  FROM student_course_enrollments sce
  JOIN users u ON u.user_id = sce.student_user_id
  JOIN student_profiles sp ON sp.user_id = u.user_id
  WHERE sce.tenant_id = v_tenant AND sp.student_login_id IN (SELECT student_login_id FROM pharmacy_sem1_students)
    AND sce.semester = 1 AND sce.status IN ('ENROLLED','COMPLETED');

  -- Derive the expected total from the current canonical active allocations.
  -- This prevents stale hard-coded course counts from blocking an approved
  -- curriculum change while still detecting cross-program enrollments below.
  SELECT COALESCE(SUM(expected.student_count * expected.course_count), 0)::INTEGER
  INTO v_expected_enrollment_count
  FROM (
    SELECT s.program_name,
           COUNT(DISTINCT s.student_login_id)::INTEGER AS student_count,
           COUNT(DISTINCT a.course_id)::INTEGER AS course_count
    FROM pharmacy_sem1_students s
    LEFT JOIN academic_course_allocations a
      ON a.tenant_id = v_tenant
     AND a.status = 'ACTIVE'
     AND a.academic_year = '2026-2027'
     AND a.semester = 'I'
     AND a.course_id IS NOT NULL
     AND a.program_name = s.program_name
    GROUP BY s.program_name
  ) expected;
  SELECT COUNT(DISTINCT sp.student_login_id) INTO v_profile_count
  FROM student_profiles sp
  WHERE sp.tenant_id = v_tenant
    AND sp.student_login_id IN (SELECT student_login_id FROM pharmacy_sem1_students)
    AND sp.current_semester = 1
    AND sp.status = 'ACTIVE';

  IF v_profile_count <> 151 OR v_enrollment_count <> v_expected_enrollment_count THEN
    RAISE EXCEPTION 'Pharmacy Semester-I reconciliation failed: profiles %, enrollments %; expected profiles 151 and enrollments %',
      v_profile_count, v_enrollment_count, v_expected_enrollment_count;
  END IF;

  SELECT COUNT(*) INTO v_profile_count
  FROM student_profiles sp
  WHERE sp.tenant_id = v_tenant
    AND sp.student_login_id IN (SELECT student_login_id FROM pharmacy_sem1_students)
    AND sp.current_semester = 1
    AND sp.admission_status = 'ACTIVE';
  IF v_profile_count <> v_count THEN
    RAISE EXCEPTION 'Student profile reconciliation failed: expected %, found %', v_count, v_profile_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM student_profiles sp
    WHERE sp.tenant_id = v_tenant AND sp.student_login_id = '2646383'
  ) THEN
    RAISE EXCEPTION 'Rejected student SID 2646383 must not be provisioned';
  END IF;

  -- Every accepted student must receive exactly one enrollment for each
  -- distinct active Semester-I course in their exact canonical programme.
  -- This catches broad programme joins (for example, B.Pharm -> D.Pharm).
  IF EXISTS (
    WITH expected AS (
      SELECT s.program_name,
             COUNT(DISTINCT s.student_login_id)::INTEGER
               * COUNT(DISTINCT a.course_id)::INTEGER AS expected_count
      FROM pharmacy_sem1_students s
      LEFT JOIN academic_course_allocations a
        ON a.tenant_id = v_tenant
       AND a.status = 'ACTIVE'
       AND a.academic_year = '2026-2027'
       AND a.semester = 'I'
       AND a.course_id IS NOT NULL
       AND a.program_name = s.program_name
      GROUP BY s.program_name
    ), actual AS (
      SELECT sp.program_name, COUNT(*)::INTEGER AS actual_count
      FROM student_course_enrollments sce
      JOIN student_profiles sp ON sp.user_id = sce.student_user_id AND sp.tenant_id = v_tenant
      WHERE sce.tenant_id = v_tenant
        AND sce.semester = 1
        AND sce.status IN ('ENROLLED','COMPLETED')
        AND sp.student_login_id IN (SELECT student_login_id FROM pharmacy_sem1_students)
      GROUP BY sp.program_name
    )
    SELECT 1
    FROM expected e
    LEFT JOIN actual a USING (program_name)
    WHERE COALESCE(a.actual_count, 0) <> e.expected_count
  ) THEN
    RAISE EXCEPTION 'Semester-I Pharmacy enrollment reconciliation failed by programme';
  END IF;

  INSERT INTO student_migration_manifest(tenant_id, source_file_name, source_file_sha256, eligible_count, excluded_count)
  VALUES(v_tenant, '2026 Students (1).xls', '4759dae54192010eca8207707ac6dc299c882e5172c6eca6bc1c9c7f5b02c5ca', 151, 1)
  ON CONFLICT (tenant_id, source_file_sha256) DO NOTHING;
END $$;

COMMIT;
