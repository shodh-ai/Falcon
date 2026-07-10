-- Link school Deans to schools + iam_programs so Dean portal scope resolves correctly.
-- HOD mapping (departments.hod_user_id) is separate from Dean scope (schools.dean_user_id).

CREATE TEMP TABLE dean_map (
  school_name text,
  school_code text,
  dean_email text,
  dept_name text
);

INSERT INTO dean_map (school_name, school_code, dean_email, dept_name) VALUES
  ('School of Applied Sciences',            'SAS',  'gaurav.sharma@mygyanvihar.com',        'Applied Sciences'),
  ('Learning Centre with Google (CA)',    'CA',   'anil.pal@mygyanvihar.com',             'CA'),
  ('International School of Business',    'ISBM', 'dean.isbm@mygyanvihar.com',            'ISBM'),
  ('School of Interdisciplinary Studies', 'SILS', 'kalpana.randhawa@mygyanvihar.com',     'SILS'),
  ('School of Law',                       'LAW',  'venoo.rajpurohit@mygyanvihar.com',     'Law'),
  ('School of Education',                 'EDU',  'shruti.tiwari@mygyanvihar.com',        'Education'),
  ('School of Agriculture',               'AGR',  'ajeetsingh.shekhawat@mygyanvihar.com', 'Agriculture'),
  ('Centre for Climate Change & Water',   'C3WR', 'suraj.kumar@mygyanvihar.com',          'C3WR'),
  ('School of Pharmacy',                  'PHM',  'hitesh.kumar@mygyanvihar.com',         'Pharmacy'),
  ('Department of Mechanical Engg',       'MECH', 'neeraj.kumar1@mygyanvihar.com',        'Mech Engg'),
  ('Department of Physiotherapy',         'BPT',  'gaurav.agarwal@mygyanvihar.com',       'BPT'),
  ('Gyan Vihar Centre for Arts & Design', 'GCAD', 'gauri.sharma@mygyanvihar.com',         'GCAD'),
  ('Department of Civil Engineering',     'CIV',  'ravindra.budania@mygyanvihar.com',     'Civil'),
  ('Department of Clinical Psychology',   'CLPSY','khushpreet.kaur@mygyanvihar.com',      'Clinical Psychology');

INSERT INTO schools (school_name, school_code, dean_user_id)
SELECT dm.school_name, dm.school_code, u.user_id
FROM dean_map dm
JOIN users u ON lower(u.official_email) = lower(dm.dean_email)
WHERE NOT EXISTS (
  SELECT 1 FROM schools s
  WHERE lower(s.school_name) = lower(dm.school_name) AND s.deleted_at IS NULL
);

UPDATE schools s
SET dean_user_id = u.user_id, updated_at = NOW()
FROM dean_map dm
JOIN users u ON lower(u.official_email) = lower(dm.dean_email)
WHERE lower(s.school_name) = lower(dm.school_name)
  AND s.deleted_at IS NULL;

INSERT INTO iam_programs (program_name, program_code, duration_years, school_id, dept_id)
SELECT
  d.dept_name || ' Program',
  dm.school_code || '-MAIN',
  4,
  s.school_id,
  d.dept_id
FROM dean_map dm
JOIN departments d ON d.dept_name = dm.dept_name
JOIN schools s ON lower(s.school_name) = lower(dm.school_name) AND s.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM iam_programs p
  WHERE p.school_id = s.school_id AND p.dept_id = d.dept_id AND p.deleted_at IS NULL
);

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, r.role_id, false
FROM users u
JOIN roles r ON r.role_name = 'Dean'
WHERE lower(u.official_email) IN (
  'gaurav.sharma@mygyanvihar.com', 'anil.pal@mygyanvihar.com', 'dean.isbm@mygyanvihar.com',
  'kalpana.randhawa@mygyanvihar.com', 'venoo.rajpurohit@mygyanvihar.com', 'shruti.tiwari@mygyanvihar.com',
  'ajeetsingh.shekhawat@mygyanvihar.com'
)
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
);

DROP TABLE dean_map;
