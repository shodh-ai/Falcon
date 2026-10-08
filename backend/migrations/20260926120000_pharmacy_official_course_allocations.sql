-- Replace provisional Pharmacy teaching allocations with the department-approved
-- 2026-2027 load. Shared teaching is preserved as separate faculty allocations.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE subdomain='sgvu' AND is_active=true) THEN
    RAISE EXCEPTION 'Active SGVU tenant is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM departments WHERE lower(dept_name)='pharmacy' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Active Pharmacy department is required';
  END IF;
END $$;

-- The prior slot-level uniqueness silently prevented legitimate co-teaching.
DROP INDEX IF EXISTS uq_course_allocations_slot;
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_allocations_active_faculty_slot
  ON academic_course_allocations(
    tenant_id, subject_id, program_name, semester, academic_year, faculty_user_id
  )
  WHERE status='ACTIVE';

CREATE TEMP TABLE pharmacy_official_load (
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  program_name TEXT NOT NULL,
  semester TEXT NOT NULL,
  faculty_email TEXT NOT NULL,
  PRIMARY KEY(subject_code,program_name,semester,faculty_email)
) ON COMMIT DROP;

INSERT INTO pharmacy_official_load VALUES
  ('BP102T','General Pharmacy',3,'THEORY','B.Pharm','I','mahendra.saini@mygyanvihar.com'),
  ('BP107P','General Pharmacy Practical',1,'LAB','B.Pharm','I','mahendra.saini@mygyanvihar.com'),
  ('BP508P','Pharmacognosy and Phytochemistry II Practical',2,'LAB','B.Pharm','V','priya.sen@mygyanvihar.com'),
  ('ER2026T','Pharmacy Law and Ethics',3,'THEORY','D.Pharm','III','priya.sen@mygyanvihar.com'),
  ('BP506P','Industrial Pharmacy I Practical',2,'LAB','B.Pharm','V','manish.gupta@mygyanvihar.com'),
  ('BP706PS','Practice School',6,'OTHER','B.Pharm','VII','manish.gupta@mygyanvihar.com'),
  ('ER2013T','Pharmacognosy',3,'THEORY','D.Pharm','I','neeraj.patel@mygyanvihar.com'),
  ('BP105T','Introduction to Pharmacognosy',3,'THEORY','B.Pharm','I','neeraj.patel@mygyanvihar.com'),
  ('BP110P','Introduction to Pharmacognosy Practical',1,'LAB','B.Pharm','I','neeraj.patel@mygyanvihar.com'),
  ('BP306P','Physical Pharmaceutics Practical',2,'LAB','B.Pharm','III','aishwarya.rathore@mygyanvihar.com'),
  ('BP302T','Physical Pharmaceutics I',4,'THEORY','B.Pharm','III','aishwarya.rathore@mygyanvihar.com'),
  ('BP111P','Pharmaceutical Inorganic and Analytical Chemistry Practical',1,'LAB','B.Pharm','I','yogesh.matta@mygyanvihar.com'),
  ('BP106T','Pharmaceutical Inorganic and Analytical Chemistry',3,'THEORY','B.Pharm','I','yogesh.matta@mygyanvihar.com'),
  ('BP308P','Pharmaceutical Engineering Practical',2,'LAB','B.Pharm','III','neha.arora@mygyanvihar.com'),
  ('BP304T','Pharmaceutical Engineering',4,'THEORY','B.Pharm','III','neha.arora@mygyanvihar.com'),
  ('BP503T','Pharmacology II',4,'THEORY','B.Pharm','V','prashantkr.dhakad@mygyanvihar.com'),
  ('BP108P','Healthcare Psychology and Communication Skills Practical',1,'LAB','B.Pharm','I','prashantkr.dhakad@mygyanvihar.com'),
  ('MPH104T','Regulatory Affair',4,'THEORY','M.Pharm Pharmaceutics','I','prashantkr.dhakad@mygyanvihar.com'),
  ('ER2015T','Social Pharmacy',3,'THEORY','D.Pharm','I','shalu.jain@mygyanvihar.com'),
  ('BP307P','Pharmaceutical Microbiology Practical',2,'LAB','B.Pharm','III','shalu.jain@mygyanvihar.com'),
  ('BP303T','Pharmaceutical Microbiology',4,'THEORY','B.Pharm','III','shalu.jain@mygyanvihar.com'),
  ('BP704T','Novel Drug Delivery System',4,'THEORY','B.Pharm','VII','tapasvi.gupta@mygyanvihar.com'),
  ('MPH103T','Modern Pharmaceutics',4,'THEORY','M.Pharm Pharmaceutics','I','tapasvi.gupta@mygyanvihar.com'),
  ('MPH105P','Pharmaceutics Practical I',6,'LAB','M.Pharm Pharmaceutics','I','tapasvi.gupta@mygyanvihar.com'),
  ('BP702T','Industrial Pharmacy II',4,'THEORY','B.Pharm','VII','animesh.kumar@mygyanvihar.com'),
  ('BP101T','Basics of Python Programming for Pharmaceutical Sciences',2,'THEORY','B.Pharm','I','animesh.kumar@mygyanvihar.com'),
  ('ER2012T','Pharmaceutical Chemistry',3,'THEORY','D.Pharm','I','animesh.kumar@mygyanvihar.com'),
  ('ER2012P','Pharmaceutical Chemistry Practical',2,'LAB','D.Pharm','I','animesh.kumar@mygyanvihar.com'),
  ('BP505T','Pharmaceutical Jurisprudence',4,'THEORY','B.Pharm','V','hitesh.kumar@mygyanvihar.com'),
  ('BP706PS','Practice School',6,'OTHER','B.Pharm','VII','hitesh.kumar@mygyanvihar.com'),
  ('BP103T','Healthcare Psychology and Communication Skills',1,'THEORY','B.Pharm','I','hitesh.kumar@mygyanvihar.com'),
  ('ER2014T','Human Anatomy and Physiology',3,'THEORY','D.Pharm','I','muskan.jain@mygyanvihar.com'),
  ('ER2014P','Human Anatomy and Physiology Practical',2,'LAB','D.Pharm','I','muskan.jain@mygyanvihar.com'),
  ('ER2022P','Community Pharmacy and Management Practical',3,'LAB','D.Pharm','III','muskan.jain@mygyanvihar.com'),
  ('ER2022T','Community Pharmacy and Management',3,'THEORY','D.Pharm','III','muskan.jain@mygyanvihar.com'),
  ('BP703T','Pharmacy Practice',4,'THEORY','B.Pharm','VII','arjun.kaushik@mygyanvihar.com'),
  ('ER2021P','Pharmacology Practical',3,'LAB','D.Pharm','III','arjun.kaushik@mygyanvihar.com'),
  ('ER2021T','Pharmacology',3,'THEORY','D.Pharm','III','arjun.kaushik@mygyanvihar.com'),
  ('BP705P','Instrumental Method of Analysis Practical',2,'LAB','B.Pharm','VII','charu.misra@mygyanvihar.com'),
  ('BP701T','Instrumental Method of Analysis',4,'THEORY','B.Pharm','VII','charu.misra@mygyanvihar.com'),
  ('BP501T','Medicinal Chemistry II',4,'THEORY','B.Pharm','V','sandeep.kumar@mygyanvihar.com'),
  ('ER2011P','Pharmaceutics Practical',3,'LAB','D.Pharm','I','sandeep.kumar@mygyanvihar.com'),
  ('ER2011T','Pharmaceutics Theory',3,'THEORY','D.Pharm','I','sandeep.kumar@mygyanvihar.com'),
  ('BP502T','Industrial Pharmacy I',4,'THEORY','B.Pharm','V','supriya.sarkar@mygyanvihar.com'),
  ('ER2013P','Pharmacognosy Practical',2,'LAB','D.Pharm','I','supriya.sarkar@mygyanvihar.com'),
  ('ER2025T','Hospital and Clinical Pharmacy',3,'THEORY','D.Pharm','III','supriya.sarkar@mygyanvihar.com'),
  ('BP504T','Pharmacognosy and Phytochemistry II',4,'THEORY','B.Pharm','V','samarpan.mishra@mygyanvihar.com'),
  ('ER2015P','Social Pharmacy Practical',2,'LAB','D.Pharm','I','samarpan.mishra@mygyanvihar.com'),
  ('ER2023P','Biochemistry and Clinical Pathology Practical',3,'LAB','D.Pharm','III','samarpan.mishra@mygyanvihar.com'),
  ('ER2023T','Biochemistry and Clinical Pathology',3,'THEORY','D.Pharm','III','samarpan.mishra@mygyanvihar.com'),
  ('MPH106P','Seminar Assignment',4,'OTHER','M.Pharm Pharmaceutics','I','manish1.gupta@mygyanvihar.com'),
  ('MPH102T','Drug Delivery System',4,'THEORY','M.Pharm Pharmaceutics','I','manish1.gupta@mygyanvihar.com'),
  ('MPH105P','Pharmaceutics Practical I',6,'LAB','M.Pharm Pharmaceutics','I','manish1.gupta@mygyanvihar.com'),
  ('MPH302P','Journal Club Practical',1,'LAB','M.Pharm Pharmaceutics','III','manish1.gupta@mygyanvihar.com'),
  ('MPH303P','Discussion Presentation',2,'OTHER','M.Pharm Pharmaceutics','III','manish1.gupta@mygyanvihar.com'),
  ('MPH304P','Research Work',14,'OTHER','M.Pharm Pharmaceutics','III','manish1.gupta@mygyanvihar.com'),
  ('BP305P','Pharmaceutical Organic Chemistry II Practical',2,'LAB','B.Pharm','III','abha.mishra@mygyanvihar.com'),
  ('BP301T','Pharmaceutical Organic Chemistry II',4,'THEORY','B.Pharm','III','abha.mishra@mygyanvihar.com'),
  ('MPH301T','Research Methodology and Biostatistics',4,'THEORY','M.Pharm Pharmaceutics','III','abha.mishra@mygyanvihar.com'),
  ('BP104T','Human Anatomy Physiology and Pathophysiology I',4,'THEORY','B.Pharm','I','amit.kaushik@mygyanvihar.com'),
  ('BP109P','Human Anatomy Physiology and Pathophysiology I Practical',1,'LAB','B.Pharm','I','amit.kaushik@mygyanvihar.com'),
  ('BP507P','Pharmacology II Practical',2,'LAB','B.Pharm','V','vivek.gupta@mygyanvihar.com'),
  ('MPH101T','Modern Pharmaceutical Analytical Techniques',4,'THEORY','M.Pharm Pharmaceutics','I','vivek.gupta@mygyanvihar.com'),
  ('ER2024P','Pharmacotherapeutics Practical',3,'LAB','D.Pharm','III','alisha.singh@mygyanvihar.com'),
  ('ER2025P','Hospital and Clinical Pharmacy Practical',3,'LAB','D.Pharm','III','alisha.singh@mygyanvihar.com'),
  ('ER2024T','Pharmacotherapeutics',3,'THEORY','D.Pharm','III','alisha.singh@mygyanvihar.com'),
  ('BP107P','General Pharmacy Practical',1,'LAB','B.Pharm','I','gauri.gupta@mygyanvihar.com'),
  ('ER2013T','Pharmacognosy',3,'THEORY','D.Pharm','I','gauri.gupta@mygyanvihar.com');

-- Ensure all three programmes exist. B.Pharm lateral entry remains an admission route.
INSERT INTO iam_programs(program_name,program_code,duration_years)
SELECT v.program_name,v.program_code,v.duration_years
FROM (VALUES
  ('B.Pharm','BPHARM',4),
  ('D.Pharm','DPHARM',2),
  ('M.Pharm Pharmaceutics','MPHARM-PHARMACEUTICS',2)
) v(program_name,program_code,duration_years)
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs p
  WHERE upper(p.program_code)=upper(v.program_code) AND p.deleted_at IS NULL
);

WITH source_courses AS (
  SELECT DISTINCT ON(subject_code)
    subject_code,subject_name,credits,subject_type,program_name,
    CASE semester WHEN 'I' THEN 1 WHEN 'III' THEN 3 WHEN 'V' THEN 5 WHEN 'VII' THEN 7 END AS semester
  FROM pharmacy_official_load
  ORDER BY subject_code,faculty_email
), programmes AS (
  SELECT program_id,
         CASE upper(program_code)
           WHEN 'BPHARM' THEN 'B.Pharm'
           WHEN 'DPHARM' THEN 'D.Pharm'
           WHEN 'MPHARM-PHARMACEUTICS' THEN 'M.Pharm Pharmaceutics'
         END AS program_name
  FROM iam_programs
  WHERE upper(program_code) IN('BPHARM','DPHARM','MPHARM-PHARMACEUTICS')
    AND deleted_at IS NULL
)
INSERT INTO academic_subjects(
  subject_code,subject_name,subject_shortname,program_id,semester,credits,subject_type,is_active,deleted_at
)
SELECT s.subject_code,s.subject_name,s.subject_code,p.program_id,s.semester,s.credits,s.subject_type,true,NULL
FROM source_courses s JOIN programmes p USING(program_name)
ON CONFLICT(subject_code) DO UPDATE SET
  subject_name=EXCLUDED.subject_name,
  subject_shortname=EXCLUDED.subject_shortname,
  program_id=EXCLUDED.program_id,
  semester=EXCLUDED.semester,
  credits=EXCLUDED.credits,
  subject_type=EXCLUDED.subject_type,
  is_active=true,
  deleted_at=NULL,
  updated_at=NOW();

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain='sgvu' AND is_active=true LIMIT 1
), source_courses AS (
  SELECT DISTINCT ON(subject_code) subject_code,subject_name,credits,subject_type
  FROM pharmacy_official_load ORDER BY subject_code,faculty_email
)
INSERT INTO academic_courses(tenant_id,course_code,course_name,credits,is_elective,course_type,deleted_at)
SELECT t.tenant_id,s.subject_code,s.subject_name,s.credits,false,
       CASE s.subject_type WHEN 'LAB' THEN 'LAB' ELSE 'CORE' END,NULL
FROM tenant t CROSS JOIN source_courses s
ON CONFLICT(tenant_id,course_code) DO UPDATE SET
  course_name=EXCLUDED.course_name,
  credits=EXCLUDED.credits,
  is_elective=false,
  course_type=EXCLUDED.course_type,
  deleted_at=NULL;

-- Preserve provisional history, but remove it from every active projection.
WITH ctx AS (
  SELECT t.tenant_id,d.dept_id
  FROM public.tenants t
  JOIN departments d ON lower(d.dept_name)='pharmacy' AND d.deleted_at IS NULL
  WHERE t.subdomain='sgvu' AND t.is_active=true
  ORDER BY d.dept_id LIMIT 1
)
UPDATE academic_course_allocations a
SET status='SUPERSEDED',updated_at=NOW()
FROM users u,ctx
WHERE a.tenant_id=ctx.tenant_id
  AND a.faculty_user_id=u.user_id
  AND u.tenant_id=ctx.tenant_id
  AND u.dept_id=ctx.dept_id
  AND a.status='ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM pharmacy_official_load l
    JOIN academic_courses c ON c.course_id=a.course_id
    WHERE lower(l.faculty_email)=lower(u.official_email)
      AND l.subject_code=c.course_code
      AND l.program_name IS NOT DISTINCT FROM a.program_name
      AND l.semester IS NOT DISTINCT FROM a.semester
  );

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain='sgvu' AND is_active=true LIMIT 1
)
INSERT INTO academic_course_allocations(
  tenant_id,subject_id,program_name,semester,faculty_user_id,academic_year,course_id,status
)
SELECT t.tenant_id,s.subject_id,l.program_name,l.semester,u.user_id,'2026-2027',c.course_id,'ACTIVE'
FROM pharmacy_official_load l
CROSS JOIN tenant t
JOIN academic_subjects s ON s.subject_code=l.subject_code AND s.deleted_at IS NULL
JOIN academic_courses c ON c.tenant_id=t.tenant_id AND c.course_code=l.subject_code AND c.deleted_at IS NULL
JOIN users u ON u.tenant_id=t.tenant_id AND lower(u.official_email)=lower(l.faculty_email)
  AND u.is_active=true AND u.deleted_at IS NULL
ON CONFLICT(tenant_id,subject_id,program_name,semester,academic_year,faculty_user_id)
  WHERE status='ACTIVE'
DO UPDATE SET course_id=EXCLUDED.course_id,status='ACTIVE',updated_at=NOW();

-- Retire stale provisional timetable authority. Matching official assignments,
-- if any, remain active; no new timetable is invented from a teaching-load file.
WITH ctx AS (
  SELECT t.tenant_id,d.dept_id
  FROM public.tenants t
  JOIN departments d ON lower(d.dept_name)='pharmacy' AND d.deleted_at IS NULL
  WHERE t.subdomain='sgvu' AND t.is_active=true
  ORDER BY d.dept_id LIMIT 1
)
UPDATE academic_timetables tt
SET deleted_at=NOW()
FROM users u,academic_courses c,ctx
WHERE tt.tenant_id=ctx.tenant_id
  AND tt.faculty_user_id=u.user_id
  AND u.tenant_id=ctx.tenant_id
  AND u.dept_id=ctx.dept_id
  AND tt.course_id=c.course_id
  AND tt.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pharmacy_official_load l
    WHERE lower(l.faculty_email)=lower(u.official_email)
      AND l.subject_code=c.course_code
  );

DO $$
DECLARE active_count INTEGER; faculty_count INTEGER; course_count INTEGER;
BEGIN
  SELECT COUNT(*),COUNT(DISTINCT a.faculty_user_id),COUNT(DISTINCT a.course_id)
  INTO active_count,faculty_count,course_count
  FROM academic_course_allocations a
  JOIN users u ON u.user_id=a.faculty_user_id
  JOIN departments d ON d.dept_id=u.dept_id
  JOIN public.tenants t ON t.tenant_id=a.tenant_id
  WHERE t.subdomain='sgvu' AND lower(d.dept_name)='pharmacy'
    AND a.academic_year='2026-2027' AND a.status='ACTIVE';
  IF active_count<>68 OR faculty_count<>24 OR course_count<>64 THEN
    RAISE EXCEPTION 'Pharmacy load reconciliation failed: allocations %, faculty %, courses %',
      active_count,faculty_count,course_count;
  END IF;
END $$;

COMMIT;
