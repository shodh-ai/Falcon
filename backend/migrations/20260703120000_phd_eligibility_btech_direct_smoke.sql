-- Smoke data for Ph.D. application eligibility.
-- Seeds a full test matrix across the available student personas (password123):
--   student3 → B.Tech, 2nd year cleared, CGPA 8.6, no backlog  → DIRECT route ALLOWED (needs entrance evidence at submit)
--   student4 → B.Tech, 2nd year cleared, CGPA 6.9, no backlog  → BLOCKED (CGPA below 8.0 merit cutoff)
--   student5 → B.Tech, only 2nd semester (2nd year NOT cleared) → BLOCKED (second year not cleared)
--   student6 → M.Tech (PG candidate), CGPA 7.5, no backlog      → PG route ALLOWED (can submit directly)
--   student7 → B.Tech, 2nd year cleared, CGPA 8.2, 1 backlog    → BLOCKED (active backlog)
-- Verify on /student/phd after logging in as each student.

INSERT INTO smoke_seed_manifest (smoke_key, portal, role_email, feature_area, sample_record, notes)
VALUES (
  'phd.eligibility',
  'research',
  'student3@mygyanvihar.com',
  'Ph.D. Application Eligibility',
  'student3 B.Tech direct-eligible; student6 PG-eligible; student4/5/7 blocked variants',
  'Eligibility shown on /student/phd. B.Tech direct route needs a PET/GATE/NET score or approved direct-PhD merit at submission.'
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
  v_uid UUID;
  rec RECORD;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Skipping phd eligibility smoke: tenant not found';
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('student3@mygyanvihar.com', 'B.Tech Computer Science Engineering', '2025-26', 4, 8.60, 0),
      ('student4@mygyanvihar.com', 'B.Tech Mechanical Engineering',       '2025-26', 5, 6.90, 0),
      ('student5@mygyanvihar.com', 'B.Tech Civil Engineering',            '2024-25', 2, 8.50, 0),
      ('student6@mygyanvihar.com', 'M.Tech Computer Science',             '2025-26', 2, 7.50, 0),
      ('student7@mygyanvihar.com', 'B.Tech Electronics Engineering',      '2025-26', 6, 8.20, 1)
    ) AS t(email, program, ay, sem, cgpa, backlogs)
  LOOP
    SELECT user_id INTO v_uid FROM users
     WHERE tenant_id = v_tenant AND lower(official_email) = rec.email LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE NOTICE 'Skipping % : user not found', rec.email;
      CONTINUE;
    END IF;

    -- Programme signal used by the eligibility classifier.
    IF to_regclass('public.student_applications') IS NOT NULL THEN
      INSERT INTO student_applications (
        tenant_id, student_user_id, application_no, applicant_name, program_applied,
        admission_type, status, created_at
      ) VALUES (
        v_tenant, v_uid, 'SMOKE-PHD-' || split_part(rec.email, '@', 1),
        initcap(split_part(rec.email, '@', 1)), rec.program, 'REGULAR', 'ADMITTED', NOW()
      )
      ON CONFLICT (tenant_id, application_no) DO UPDATE SET
        program_applied = EXCLUDED.program_applied,
        student_user_id = EXCLUDED.student_user_id,
        created_at = NOW(),
        updated_at = NOW();
    END IF;

    -- Academic standing: latest semester, CGPA, and backlog count.
    IF to_regclass('public.academic_records') IS NOT NULL THEN
      INSERT INTO academic_records (
        tenant_id, student_user_id, academic_year, semester,
        cgpa, sgpa, backlog_count, progression_status
      ) VALUES (
        v_tenant, v_uid, rec.ay, rec.sem,
        rec.cgpa, rec.cgpa, rec.backlogs,
        CASE WHEN rec.backlogs > 0 THEN 'IN_PROGRESS' ELSE 'PROMOTED' END
      )
      ON CONFLICT (tenant_id, student_user_id, academic_year, semester) DO UPDATE SET
        cgpa = EXCLUDED.cgpa,
        sgpa = EXCLUDED.sgpa,
        backlog_count = EXCLUDED.backlog_count,
        progression_status = EXCLUDED.progression_status,
        updated_at = NOW();
    END IF;

    -- Backlog history: clear stale ACTIVE rows for the no-backlog personas.
    IF to_regclass('public.student_backlog_history') IS NOT NULL AND rec.backlogs = 0 THEN
      UPDATE student_backlog_history
         SET status = 'CLEARED', cleared_at = COALESCE(cleared_at, NOW())
       WHERE tenant_id = v_tenant AND student_user_id = v_uid AND status = 'ACTIVE';
    END IF;
  END LOOP;

  RAISE NOTICE 'Ph.D. eligibility smoke matrix seeded (student3-student7)';
END $$;
