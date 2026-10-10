-- Approved Pharmacy Semester-I roster and timetable, effective 15 July 2026.
-- Source: supplied B.Pharm LT-27, D.Pharm LT-24 and M.Pharm LT-23/24 timetables.
-- This migration reconciles faculty abbreviations to HR identities, assigns the
-- supplied sections to the accepted student identities, and records timetable slots.

BEGIN;

CREATE TEMP TABLE pharmacy_sem1_official_map(
  course_code VARCHAR(50) NOT NULL,
  program_name VARCHAR(200) NOT NULL,
  semester VARCHAR(10) NOT NULL,
  faculty_email VARCHAR(255) NOT NULL,
  PRIMARY KEY(course_code,program_name,semester,faculty_email)
) ON COMMIT DROP;
INSERT INTO pharmacy_sem1_official_map(course_code,program_name,semester,faculty_email) VALUES
  ('BP101T','B.Pharm','I','amit.kaushik@mygyanvihar.com'),
  ('BP102T','B.Pharm','I','mahendra.saini@mygyanvihar.com'),
  ('BP103T','B.Pharm','I','hitesh.kumar@mygyanvihar.com'),
  ('BP104T','B.Pharm','I','amit.kaushik@mygyanvihar.com'),
  ('BP105T','B.Pharm','I','neeraj.patel@mygyanvihar.com'),
  ('BP106T','B.Pharm','I','yogesh.matta@mygyanvihar.com'),
  ('BP107P','B.Pharm','I','mahendra.saini@mygyanvihar.com'),
  ('BP108P','B.Pharm','I','prashantkr.dhakad@mygyanvihar.com'),
  ('BP109P','B.Pharm','I','amit.kaushik@mygyanvihar.com'),
  ('BP110P','B.Pharm','I','neeraj.patel@mygyanvihar.com'),
  ('BP111P','B.Pharm','I','yogesh.matta@mygyanvihar.com'),
  ('ER2011T','D.Pharm','I','sandeep.kumar@mygyanvihar.com'),
  ('ER2011P','D.Pharm','I','sandeep.kumar@mygyanvihar.com'),
  ('ER2012T','D.Pharm','I','animesh.kumar@mygyanvihar.com'),
  ('ER2012P','D.Pharm','I','animesh.kumar@mygyanvihar.com'),
  ('ER2013T','D.Pharm','I','neeraj.patel@mygyanvihar.com'),
  ('ER2013P','D.Pharm','I','supriya.sarkar@mygyanvihar.com'),
  ('ER2014T','D.Pharm','I','muskan.jain@mygyanvihar.com'),
  ('ER2014P','D.Pharm','I','muskan.jain@mygyanvihar.com'),
  ('ER2015T','D.Pharm','I','shalu.jain@mygyanvihar.com'),
  ('ER2015P','D.Pharm','I','shalu.jain@mygyanvihar.com'),
  ('MPH101T','M.Pharm Pharmaceutics','I','vivek.gupta@mygyanvihar.com'),
  ('MPH102T','M.Pharm Pharmaceutics','I','manish1.gupta@mygyanvihar.com'),
  ('MPH103T','M.Pharm Pharmaceutics','I','tapasvi.gupta@mygyanvihar.com'),
  ('MPH104T','M.Pharm Pharmaceutics','I','prashantkr.dhakad@mygyanvihar.com'),
  ('MPH105P','M.Pharm Pharmaceutics','I','manish1.gupta@mygyanvihar.com'),
  ('MPH105P','M.Pharm Pharmaceutics','I','tapasvi.gupta@mygyanvihar.com'),
  ('MPH106P','M.Pharm Pharmaceutics','I','manish1.gupta@mygyanvihar.com');

-- The earlier zero-load declaration predates the department-approved M.Pharm
-- timetable. Reconcile Vivek Gupta's declaration before the allocation trigger
-- evaluates the approved MPAT assignment. Preeti Khulbe remains NO_TEACHING_LOAD.
DO $$
DECLARE
  v_tenant UUID;
  v_faculty UUID;
  v_changed_by UUID;
  v_declaration UUID;
  v_revision INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.tenants
  WHERE subdomain='sgvu' AND is_active=true LIMIT 1;
  SELECT u.user_id INTO v_faculty FROM users u
  WHERE u.tenant_id=v_tenant AND lower(u.official_email)='vivek.gupta@mygyanvihar.com'
    AND u.is_active=true AND u.deleted_at IS NULL LIMIT 1;
  SELECT u.user_id INTO v_changed_by FROM users u
  WHERE u.tenant_id=v_tenant AND lower(u.official_email)='hitesh.kumar@mygyanvihar.com'
    AND u.is_active=true AND u.deleted_at IS NULL LIMIT 1;
  IF v_faculty IS NOT NULL THEN
    UPDATE academic_faculty_load_declarations
    SET status='AVAILABLE_FOR_ALLOCATION',
        reason='Department-approved M.Pharm Semester-I timetable effective 15 July 2026',
        revision=revision+1,
        declared_by=COALESCE(v_changed_by, declared_by),
        updated_at=NOW()
    WHERE tenant_id=v_tenant AND faculty_user_id=v_faculty
      AND academic_year='2026-2027' AND status='NO_TEACHING_LOAD'
    RETURNING declaration_id,revision INTO v_declaration,v_revision;
    IF v_declaration IS NOT NULL THEN
      INSERT INTO academic_faculty_load_declaration_history(
        declaration_id,tenant_id,faculty_user_id,academic_year,status,reason,
        revision,changed_by,idempotency_key,request_hash
      ) VALUES (
        v_declaration,v_tenant,v_faculty,'2026-2027','AVAILABLE_FOR_ALLOCATION',
        'Department-approved M.Pharm Semester-I timetable effective 15 July 2026',
        v_revision,v_changed_by,'pharmacy-sem1-official-timetable-v1',
        '6c24a7d5f5d3cb8c8a1a65b7e8f640a32fd4b6e4a98a5fd0a75a2a31b6e0f59c'
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- Supersede stale Semester-I assignments before inserting the approved faculty map.
UPDATE academic_course_allocations a
SET status='SUPERSEDED', updated_at=NOW()
FROM public.tenants t
WHERE a.tenant_id=t.tenant_id AND t.subdomain='sgvu'
  AND a.academic_year='2026-2027' AND a.semester='I'
  AND a.program_name IN ('B.Pharm','D.Pharm','M.Pharm Pharmaceutics')
  AND a.status='ACTIVE';

WITH ctx AS (SELECT tenant_id FROM public.tenants WHERE subdomain='sgvu' AND is_active=true LIMIT 1)
INSERT INTO academic_course_allocations(tenant_id,subject_id,program_name,semester,faculty_user_id,academic_year,course_id,status)
SELECT ctx.tenant_id,s.subject_id,m.program_name,m.semester,u.user_id,'2026-2027',c.course_id,'ACTIVE'
FROM pharmacy_sem1_official_map m
CROSS JOIN ctx
JOIN academic_subjects s ON s.subject_code=m.course_code AND s.deleted_at IS NULL
JOIN academic_courses c ON c.tenant_id=ctx.tenant_id AND c.course_code=m.course_code AND c.deleted_at IS NULL
JOIN users u ON u.tenant_id=ctx.tenant_id AND lower(u.official_email)=lower(m.faculty_email) AND u.is_active=true AND u.deleted_at IS NULL
ON CONFLICT (tenant_id,subject_id,program_name,semester,academic_year,faculty_user_id) WHERE status='ACTIVE'
DO UPDATE SET course_id=EXCLUDED.course_id,status='ACTIVE',updated_at=NOW();

-- Use the approved timetable sections for all accepted Semester-I students.
UPDATE student_profiles sp
SET section_code=CASE sp.program_name
  WHEN 'B.Pharm' THEN 'LT-27'
  WHEN 'D.Pharm' THEN 'LT-24'
  WHEN 'M.Pharm Pharmaceutics' THEN 'LT-23/24'
END, updated_at=NOW()
FROM public.tenants t
WHERE sp.tenant_id=t.tenant_id AND t.subdomain='sgvu'
  AND sp.current_semester=1 AND sp.status='ACTIVE'
  AND sp.program_name IN ('B.Pharm','D.Pharm','M.Pharm Pharmaceutics');
UPDATE student_course_enrollments e
SET section_code=sp.section_code
FROM student_profiles sp
JOIN public.tenants t ON t.tenant_id=sp.tenant_id AND t.subdomain='sgvu'
WHERE e.student_user_id=sp.user_id AND e.tenant_id=sp.tenant_id
  AND sp.current_semester=1 AND sp.status='ACTIVE';

CREATE TEMP TABLE pharmacy_sem1_timetable(
  program_name VARCHAR(200) NOT NULL,
  room VARCHAR(50) NOT NULL,
  course_code VARCHAR(50) NOT NULL,
  day_of_week INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  section VARCHAR(50) NOT NULL,
  faculty_email VARCHAR(255) NOT NULL
) ON COMMIT DROP;
INSERT INTO pharmacy_sem1_timetable(program_name,room,course_code,day_of_week,start_time,end_time,section,faculty_email) VALUES
  ('B.Pharm','LT-27','BP101T',1,'09:00'::time,'10:00'::time,'A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP104T',1,'10:00'::time,'10:50'::time,'A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP106T',1,'10:50'::time,'11:40'::time,'A','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP102T',1,'11:40'::time,'12:30'::time,'A','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP107P',1,'13:30'::time,'14:20'::time,'BATCH-A','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP111P',1,'13:30'::time,'14:20'::time,'BATCH-B','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP109P',1,'13:30'::time,'14:20'::time,'BATCH-C','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP107P',1,'14:20'::time,'15:10'::time,'BATCH-B','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP111P',1,'14:20'::time,'15:10'::time,'BATCH-A','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP110P',1,'14:20'::time,'15:10'::time,'BATCH-C','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP104T',2,'09:00'::time,'10:00'::time,'A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP103T',2,'10:00'::time,'10:50'::time,'A','hitesh.kumar@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP108P',2,'10:50'::time,'12:30'::time,'BATCH-A','prashantkr.dhakad@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP107P',2,'13:30'::time,'14:20'::time,'BATCH-B','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP111P',2,'13:30'::time,'14:20'::time,'BATCH-A','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP110P',2,'13:30'::time,'14:20'::time,'BATCH-C','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP101T',3,'09:00'::time,'10:00'::time,'A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP105T',3,'10:00'::time,'10:50'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP102T',3,'10:50'::time,'11:40'::time,'A','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP104T',3,'13:30'::time,'14:20'::time,'A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP106T',4,'09:00'::time,'10:00'::time,'A','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP102T',4,'10:00'::time,'10:50'::time,'A','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP108P',4,'10:50'::time,'12:30'::time,'BATCH-B','prashantkr.dhakad@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP107P',4,'13:30'::time,'14:20'::time,'BATCH-C','mahendra.saini@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP111P',4,'13:30'::time,'14:20'::time,'BATCH-B','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP110P',4,'13:30'::time,'14:20'::time,'BATCH-A','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP105T',5,'09:00'::time,'10:00'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP104T',5,'10:00'::time,'10:50'::time,'A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP108P',5,'10:50'::time,'12:30'::time,'BATCH-C','prashantkr.dhakad@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP111P',5,'13:30'::time,'14:20'::time,'BATCH-C','yogesh.matta@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP109P',5,'13:30'::time,'14:20'::time,'BATCH-A','amit.kaushik@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP110P',5,'13:30'::time,'14:20'::time,'BATCH-B','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP105T',6,'09:00'::time,'10:00'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('B.Pharm','LT-27','BP106T',6,'10:00'::time,'10:50'::time,'A','yogesh.matta@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2013T',1,'09:00'::time,'10:00'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2012T',1,'10:00'::time,'10:50'::time,'A','animesh.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011T',1,'10:50'::time,'11:40'::time,'A','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2013T',1,'11:40'::time,'12:30'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2014P',1,'13:30'::time,'14:20'::time,'BATCH-B','muskan.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2015P',1,'13:30'::time,'14:20'::time,'BATCH-A','shalu.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2012T',2,'09:00'::time,'10:00'::time,'A','animesh.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2013T',2,'10:00'::time,'10:50'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2014T',2,'11:40'::time,'12:30'::time,'A','muskan.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2013P',2,'13:30'::time,'14:20'::time,'BATCH-A','supriya.sarkar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011P',2,'13:30'::time,'14:20'::time,'BATCH-B','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2014P',3,'09:00'::time,'11:40'::time,'BATCH-A','muskan.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2013P',3,'09:00'::time,'11:40'::time,'BATCH-B','supriya.sarkar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2014T',3,'13:30'::time,'14:20'::time,'A','muskan.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2015T',3,'14:20'::time,'15:10'::time,'A','shalu.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011T',4,'09:00'::time,'10:00'::time,'A','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2015T',4,'10:00'::time,'10:50'::time,'A','shalu.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2013T',4,'10:50'::time,'11:40'::time,'A','neeraj.patel@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2015T',4,'11:40'::time,'12:30'::time,'A','shalu.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011P',4,'13:30'::time,'14:20'::time,'BATCH-A','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2012P',4,'13:30'::time,'14:20'::time,'BATCH-B','animesh.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2014T',5,'09:00'::time,'10:00'::time,'A','muskan.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2012T',5,'10:50'::time,'11:40'::time,'A','animesh.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011T',5,'11:40'::time,'12:30'::time,'A','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011P',5,'13:30'::time,'14:20'::time,'BATCH-B','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2012P',5,'13:30'::time,'14:20'::time,'BATCH-A','animesh.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2015P',5,'13:30'::time,'14:20'::time,'BATCH-B','shalu.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2012T',6,'09:00'::time,'10:00'::time,'A','animesh.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2011T',6,'10:00'::time,'10:50'::time,'A','sandeep.kumar@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2015T',6,'10:50'::time,'11:40'::time,'A','shalu.jain@mygyanvihar.com'),
  ('D.Pharm','LT-24','ER2014T',6,'11:40'::time,'12:30'::time,'A','muskan.jain@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH104T',1,'09:00'::time,'10:00'::time,'A','prashantkr.dhakad@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH102T',1,'10:00'::time,'10:50'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH103T',1,'10:50'::time,'11:40'::time,'A','tapasvi.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH101T',1,'11:40'::time,'12:30'::time,'A','vivek.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH106P',1,'13:30'::time,'14:20'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH101T',2,'09:00'::time,'10:00'::time,'A','vivek.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH102T',2,'10:00'::time,'10:50'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH103T',2,'11:40'::time,'12:30'::time,'A','tapasvi.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH106P',2,'13:30'::time,'14:20'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH106P',2,'14:20'::time,'15:10'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH101T',3,'09:00'::time,'10:00'::time,'A','vivek.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH105P',3,'10:00'::time,'12:30'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH105P',3,'13:30'::time,'16:00'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH103T',4,'09:00'::time,'10:00'::time,'A','tapasvi.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH104T',4,'10:00'::time,'10:50'::time,'A','prashantkr.dhakad@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH102T',4,'10:50'::time,'11:40'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH101T',4,'11:40'::time,'12:30'::time,'A','vivek.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH106P',4,'13:30'::time,'14:20'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH104T',5,'09:00'::time,'10:00'::time,'A','prashantkr.dhakad@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH105P',5,'10:00'::time,'12:30'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH105P',5,'13:30'::time,'16:00'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH102T',6,'09:00'::time,'10:00'::time,'A','manish1.gupta@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH104T',6,'10:00'::time,'10:50'::time,'A','prashantkr.dhakad@mygyanvihar.com'),
  ('M.Pharm Pharmaceutics','LT-23/24','MPH103T',6,'10:50'::time,'11:40'::time,'A','tapasvi.gupta@mygyanvihar.com');

-- Remove only the old active Semester-I timetable projection in these rooms.
UPDATE academic_timetables tt SET deleted_at=NOW()
FROM public.tenants t
WHERE tt.tenant_id=t.tenant_id AND t.subdomain='sgvu'
  AND tt.room IN ('LT-27','LT-24','LT-23/24') AND tt.deleted_at IS NULL
  AND tt.course_id IN (SELECT c.course_id FROM academic_courses c WHERE c.tenant_id=tt.tenant_id
    AND c.course_code IN (SELECT DISTINCT course_code FROM pharmacy_sem1_timetable));

WITH ctx AS (SELECT tenant_id FROM public.tenants WHERE subdomain='sgvu' AND is_active=true LIMIT 1)
INSERT INTO academic_timetables(tenant_id,course_id,day_of_week,start_time,end_time,room,faculty_user_id,section,deleted_at)
SELECT ctx.tenant_id,c.course_id,s.day_of_week,s.start_time,s.end_time,s.room,u.user_id,s.section,NULL
FROM pharmacy_sem1_timetable s
CROSS JOIN ctx
JOIN academic_courses c ON c.tenant_id=ctx.tenant_id AND c.course_code=s.course_code AND c.deleted_at IS NULL
JOIN users u ON u.tenant_id=ctx.tenant_id AND lower(u.official_email)=lower(s.faculty_email) AND u.is_active=true
ON CONFLICT (tenant_id,course_id,day_of_week,start_time,end_time) WHERE deleted_at IS NULL
DO UPDATE SET room=EXCLUDED.room, faculty_user_id=EXCLUDED.faculty_user_id, section=EXCLUDED.section, deleted_at=NULL;

DO $$
DECLARE v_alloc INTEGER; v_slots INTEGER; v_students INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_alloc FROM academic_course_allocations a
  JOIN public.tenants t ON t.tenant_id=a.tenant_id AND t.subdomain='sgvu'
  WHERE a.academic_year='2026-2027' AND a.semester='I' AND a.status='ACTIVE'
    AND a.program_name IN ('B.Pharm','D.Pharm','M.Pharm Pharmaceutics')
    AND a.course_id IN (SELECT c.course_id FROM academic_courses c WHERE c.course_code IN (SELECT DISTINCT course_code FROM pharmacy_sem1_official_map));
  SELECT COUNT(*) INTO v_slots FROM academic_timetables tt
  JOIN public.tenants t ON t.tenant_id=tt.tenant_id AND t.subdomain='sgvu'
  WHERE tt.room IN ('LT-27','LT-24','LT-23/24') AND tt.deleted_at IS NULL
    AND tt.course_id IN (SELECT c.course_id FROM academic_courses c WHERE c.course_code IN (SELECT DISTINCT course_code FROM pharmacy_sem1_timetable));
  SELECT COUNT(*) INTO v_students FROM student_profiles sp JOIN public.tenants t ON t.tenant_id=sp.tenant_id AND t.subdomain='sgvu'
  WHERE sp.current_semester=1 AND sp.status='ACTIVE' AND sp.section_code IN ('LT-27','LT-24','LT-23/24');
  IF v_alloc < 28 OR v_slots < 80 OR v_students < 151 THEN
    RAISE EXCEPTION 'Pharmacy Semester-I reconciliation failed: allocations %, slots %, students %',v_alloc,v_slots,v_students;
  END IF;
END $$;

COMMIT;
