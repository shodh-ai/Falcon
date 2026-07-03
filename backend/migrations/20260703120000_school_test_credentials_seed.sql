-- School test credentials from Falcon Test IDs (Schools).xlsx
-- Default password: password123
-- Excludes 4 special cases (2 gmail Clinical Psychology, 2 Agriculture deepak*)
-- Unique persons only; cross-sheet duplicates use first sheet department
-- Total users: 166 (52 staff, 114 students)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Student') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Student', 'Application role for Student portal access');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Faculty') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Faculty', 'Application role for Faculty portal access');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'HOD') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('HOD', 'Application role for HOD portal access');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Dean') THEN
    INSERT INTO roles (role_name, description)
    VALUES ('Dean', 'Application role for Dean portal access');
  END IF;
END $$;

INSERT INTO departments (dept_name, description)
VALUES ('CA', 'School of Commerce & Accountancy')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('ISBM', 'Institute of Business Management')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Pharmacy', 'School of Pharmacy')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Electrical Engg', 'Department of Electrical Engineering')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Clinical Psychology', 'Department of Clinical Psychology')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('SILS', 'Suresh Gyan Vihar International Literacy School')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('C3WR', 'Centre for Climate Change and Water Research')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Applied Sciences', 'School of Applied Sciences')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Mech Engg', 'Department of Mechanical Engineering')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('BPT', 'Department of Physiotherapy')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('GCAD', 'Gyan Vihar Centre for Art and Design')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Civil', 'Department of Civil Engineering')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Law', 'School of Law')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Education', 'School of Education')
ON CONFLICT (dept_name) DO NOTHING;
INSERT INTO departments (dept_name, description)
VALUES ('Agriculture', 'School of Agriculture')
ON CONFLICT (dept_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- STAFF (Faculty / HOD / Dean)
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_staff AS (
  SELECT * FROM (VALUES
    ('9818ab8a-df13-5a5a-980d-468b9b3458e2'::uuid, 'Dr. Anil Pal', 'anil.pal@mygyanvihar.com', 'CA', 'Dean'),
    ('bd44665a-4043-5b2d-8d46-5828c93de919'::uuid, 'Ms. Sonika Katta', 'sonika.katta@mygyanvihar.com', 'CA', 'Faculty'),
    ('ac3985dd-36f9-54f4-adbb-2cd783879e17'::uuid, 'Mr. Ashok Kumar', 'ashok.kumar@mygyanvihar.com', 'CA', 'Faculty'),
    ('be4b9f3f-e1f1-5f81-85fb-b8c76d97b4e2'::uuid, 'Ms Vishakha.Kumawat', 'vishakha.kumawat@mygyanvihar.com', 'CA', 'Faculty'),
    ('8978e698-a310-59dd-b0a6-7426fd6e0be0'::uuid, 'Dr. Sanjeev Kr. Mathur', 'dean.isbm@mygyanvihar.com', 'ISBM', 'Dean'),
    ('272edc33-4a9a-52ec-be6a-63d15e4fb17e'::uuid, 'Dr. Swati Mishra', 'swati.mishra@mygyanvihar.com', 'ISBM', 'Faculty'),
    ('ac451b85-7377-595b-9749-be44b4518e04'::uuid, 'Dr. Deep Mathur', 'deep.mathur@mygyanvihar.com', 'ISBM', 'Faculty'),
    ('6aa43d00-e35d-5d98-b0a8-5a48897e0ff0'::uuid, 'Dr. Richa Sharma', 'richa.sharma@mygyanvihar.com', 'ISBM', 'Faculty'),
    ('70067c8d-6ccf-553b-ba02-67d0e9276a2c'::uuid, 'Dr Hitesh Kr Kinger', 'hitesh.kumar@mygyanvihar.com', 'Pharmacy', 'HOD'),
    ('3ecd1e25-201f-5bc2-b16e-ba041e2d1e55'::uuid, 'Dr Manish Gupta', 'manish1.gupta@mygyanvihar.com', 'Pharmacy', 'Faculty'),
    ('391c3acf-4371-5e48-8e3f-dcff600f9e27'::uuid, 'Mr Mahendra Saini', 'mahendra.saini@mygyanvihar.com', 'Pharmacy', 'Faculty'),
    ('25e59cab-79a8-514c-8594-4e99cfb976fd'::uuid, 'Dr Amit Kaushik', 'amit.kaushik@mygyanvihar.com', 'Pharmacy', 'Faculty'),
    ('5557441a-b8ce-5166-be94-5a03b4589d29'::uuid, 'Ms. Khushpreet Kaur', 'khushpreet.kaur@mygyanvihar.com', 'Clinical Psychology', 'Faculty'),
    ('c467af33-18be-5e44-b4b8-bb1af4bc202b'::uuid, 'Ms. Priya Ahuja', 'priya.ahuja@mygyanvihar.com', 'Clinical Psychology', 'Faculty'),
    ('4def693e-c884-5056-81f8-b50673961c86'::uuid, 'Dr KALPANA RANDHAWA', 'kalpana.randhawa@mygyanvihar.com', 'SILS', 'Dean'),
    ('054fe37a-0888-5b63-ba7f-818fa3072338'::uuid, 'Mr. ANKIT SEN', 'ankit.sen@mygyanvihar.com', 'SILS', 'Faculty'),
    ('c5d2ffc3-eafa-5de7-8a8c-7a3891f3fe71'::uuid, 'Ms. PREETI SHEKHAWAT', 'preeti.shekhawat@mygyanvihar.com', 'SILS', 'Faculty'),
    ('da72ff61-6c4d-5780-bb04-83a777b1924d'::uuid, 'Dr. Suraj Kumar Singh', 'suraj.kumar@mygyanvihar.com', 'C3WR', 'HOD'),
    ('2eb08091-f27b-5b8a-8165-643eedf69d7f'::uuid, 'Dr. Priyanka Roy', 'priyanka.roy@mygyanvihar.com', 'C3WR', 'Faculty'),
    ('4b7bd87c-534a-515c-92cb-8d35b69044f1'::uuid, 'Dr. Saurabh Kumar Gupta', 'saurabhkr.gupta@mygyanvihar.com', 'C3WR', 'Faculty'),
    ('b885e8ea-db27-5b56-81a3-f999558d95f1'::uuid, 'Dr. Bhartendu Sajan', 'bhartendu.sajan@mygyanvihar.com', 'C3WR', 'Faculty'),
    ('a514eee2-a958-5269-a124-bf94b1d620a4'::uuid, 'Dr Gaurav Sharma', 'gaurav.sharma@mygyanvihar.com', 'Applied Sciences', 'Dean'),
    ('65d6fbfb-68e2-5e39-a331-5740399338d3'::uuid, 'Dr Reena Saxena', 'reena.saxena@mygyanvihar.com', 'Applied Sciences', 'Faculty'),
    ('4d997b48-eae7-5c8e-a173-5a0c413f1f02'::uuid, 'Dr Harshita laddha', 'harshita.laddha@mygyanvihar.com', 'Applied Sciences', 'Faculty'),
    ('178e6bdb-2145-5a6c-915e-2517b17dd809'::uuid, 'Dr Poonam Patel', 'poonam.patel@mygyanvihar.com', 'Applied Sciences', 'Faculty'),
    ('335f5f1a-4563-54fb-aef9-066adc2e0764'::uuid, 'Dr. Neeraj Kumar', 'neeraj.kumar1@mygyanvihar.com', 'Mech Engg', 'HOD'),
    ('fb89084c-20ec-56ef-a62f-bffa05394e3c'::uuid, 'Dr. Himanshu Vasnani', 'himanshu.vasnani@mygyanvihar.com', 'Mech Engg', 'Faculty'),
    ('e6385987-7580-541e-a179-fe3a1d9fc57e'::uuid, 'Dr. Amit Tiwari', 'amit.tiwari@mygyanvihar.com', 'Mech Engg', 'Faculty'),
    ('495fd9ec-fe91-5dbd-8576-7d823488daa4'::uuid, 'Dr. Raj Kumar', 'raj.kumar@mygyanvihar.com', 'Mech Engg', 'Faculty'),
    ('f209d6ad-28d1-521b-a88e-617e951c3099'::uuid, 'Dr. Gaurav Agarwal', 'gaurav.agarwal@mygyanvihar.com', 'BPT', 'HOD'),
    ('870880d4-a6a5-5781-9698-cb4a4ee6b08f'::uuid, 'Dr. Ajit K. Surana', 'ajit.surana@mygyanvihar.com', 'BPT', 'Faculty'),
    ('babeb0dd-be32-5b1d-818e-655401623eac'::uuid, 'Dr. Prachi BBaheti', 'prachi.baheti@mygyanvihar.com', 'BPT', 'Faculty'),
    ('8ed7d530-5037-53b3-8d0a-be79f47778bf'::uuid, 'Dr. Riya Gupta', 'riya.gupta@mygyanvihar.com', 'BPT', 'Faculty'),
    ('972245d9-72f6-5c7c-9a11-3b834e2976e0'::uuid, 'Ar. Gauri Sharma Tikku', 'gauri.sharma@mygyanvihar.com', 'GCAD', 'HOD'),
    ('8074c139-fe6f-56e5-84c5-ae4f247760bc'::uuid, 'Dr. Diksha Gupta', 'diksha.gupta@mygyanvihar.com', 'GCAD', 'Faculty'),
    ('dcfada0d-dbd4-567c-b2c2-7ca2a5f390d6'::uuid, 'Shubham Bhoskar', 'shubham.bhoskar@mygyanvihar.com', 'GCAD', 'Faculty'),
    ('9b8911bf-4fcc-5892-8e77-f98f0b069aba'::uuid, 'Dr Ravindra Budania', 'ravindra.budania@mygyanvihar.com', 'Civil', 'HOD'),
    ('b4d7ab84-a79e-5724-ae63-65c92f577067'::uuid, 'Dr Jagriti Gupta', 'jagriti.gupta@mygyanvihar.com', 'Civil', 'Faculty'),
    ('c79cf1fe-131a-59e2-992b-1133e5778378'::uuid, 'Dr Pradeep Kumar Shrivastava', 'pradeepkr.shrivastava@mygyanvihar.com', 'Civil', 'Faculty'),
    ('b223ce51-faf3-5c23-8e0f-7d92201c41e2'::uuid, 'Mr. Nagendra Singh Dhakar', 'nagendra.dhakar@mygyanvihar.com', 'Civil', 'Faculty'),
    ('3a39a5bb-1ee0-56a9-b679-99306b0438d5'::uuid, 'Dr. Venoo Rajpurohit', 'venoo.rajpurohit@mygyanvihar.com', 'Law', 'Dean'),
    ('d4474115-e070-5c8d-92d0-e2248d7beb61'::uuid, 'Dr. Anjali Chaudhary', 'anjali.chaudhary@mygyanvihar.com', 'Law', 'Faculty'),
    ('d3fa429e-23e3-5f0d-acfd-4b24033c5358'::uuid, 'Dr. Anushree Chaudhary', 'anushree.chaudhary@mygyanvihar.com', 'Law', 'Faculty'),
    ('efb163af-c174-5d57-beb4-8ab92fad1556'::uuid, 'Mr. Uttam Solanki', 'uttam.solanki@mygyanvihar.com', 'Law', 'Faculty'),
    ('f217822f-6443-5a9b-b048-757e7bff9cd6'::uuid, 'Dr.Shruti Tiwari', 'shruti.tiwari@mygyanvihar.com', 'Education', 'Dean'),
    ('db8febd6-2ade-5242-aac0-6bc5469141b1'::uuid, 'Dr.Shailja Dubay', 'shailja.dubey@mygyanvihar.com', 'Education', 'Faculty'),
    ('7cb088ae-5e79-5b9b-9ee3-ed14944977cb'::uuid, 'Dr.Jyoti Yadav', 'jyoti.yadav@mygyanvihar.com', 'Education', 'Faculty'),
    ('990624bc-c5c0-51ef-a1b9-15251b6b315e'::uuid, 'Dr.Beena Sharma', 'beena.sharma@mygyanvihar.com', 'Education', 'Faculty'),
    ('58d4b8e1-7b94-5064-80d9-ab6a1e1d9ca4'::uuid, 'Dr Ajeet Singh Shekhawat', 'ajeetsingh.shekhawat@mygyanvihar.com', 'Agriculture', 'Dean'),
    ('80a00828-6a52-5304-aaaa-30ee6f2bf378'::uuid, 'Dr Manas Mathur', 'manas.mathur@mygyanvihar.com', 'Agriculture', 'Faculty'),
    ('eb16038e-7e60-577d-9af0-798000fd0b3d'::uuid, 'Dr LS Dhayal', 'laxman.dhayal@mygyanvihar.com', 'Agriculture', 'Faculty'),
    ('f8fb703d-78e9-5a0a-a533-440d72df1a8f'::uuid, 'Dr Amritendu Mishra', 'amritendu.mishra@mygyanvihar.com', 'Agriculture', 'Faculty')
  ) AS s(user_id, name, email, dept_name, role_name)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{}'::jsonb
FROM seed_staff s
CROSS JOIN tenant t
CROSS JOIN pwd p
JOIN departments d ON d.dept_name = s.dept_name
JOIN roles r ON r.role_name = s.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE u.user_id IN (
  '9818ab8a-df13-5a5a-980d-468b9b3458e2'::uuid,
  'bd44665a-4043-5b2d-8d46-5828c93de919'::uuid,
  'ac3985dd-36f9-54f4-adbb-2cd783879e17'::uuid,
  'be4b9f3f-e1f1-5f81-85fb-b8c76d97b4e2'::uuid,
  '8978e698-a310-59dd-b0a6-7426fd6e0be0'::uuid,
  '272edc33-4a9a-52ec-be6a-63d15e4fb17e'::uuid,
  'ac451b85-7377-595b-9749-be44b4518e04'::uuid,
  '6aa43d00-e35d-5d98-b0a8-5a48897e0ff0'::uuid,
  '70067c8d-6ccf-553b-ba02-67d0e9276a2c'::uuid,
  '3ecd1e25-201f-5bc2-b16e-ba041e2d1e55'::uuid,
  '391c3acf-4371-5e48-8e3f-dcff600f9e27'::uuid,
  '25e59cab-79a8-514c-8594-4e99cfb976fd'::uuid,
  '5557441a-b8ce-5166-be94-5a03b4589d29'::uuid,
  'c467af33-18be-5e44-b4b8-bb1af4bc202b'::uuid,
  '4def693e-c884-5056-81f8-b50673961c86'::uuid,
  '054fe37a-0888-5b63-ba7f-818fa3072338'::uuid,
  'c5d2ffc3-eafa-5de7-8a8c-7a3891f3fe71'::uuid,
  'da72ff61-6c4d-5780-bb04-83a777b1924d'::uuid,
  '2eb08091-f27b-5b8a-8165-643eedf69d7f'::uuid,
  '4b7bd87c-534a-515c-92cb-8d35b69044f1'::uuid,
  'b885e8ea-db27-5b56-81a3-f999558d95f1'::uuid,
  'a514eee2-a958-5269-a124-bf94b1d620a4'::uuid,
  '65d6fbfb-68e2-5e39-a331-5740399338d3'::uuid,
  '4d997b48-eae7-5c8e-a173-5a0c413f1f02'::uuid,
  '178e6bdb-2145-5a6c-915e-2517b17dd809'::uuid,
  '335f5f1a-4563-54fb-aef9-066adc2e0764'::uuid,
  'fb89084c-20ec-56ef-a62f-bffa05394e3c'::uuid,
  'e6385987-7580-541e-a179-fe3a1d9fc57e'::uuid,
  '495fd9ec-fe91-5dbd-8576-7d823488daa4'::uuid,
  'f209d6ad-28d1-521b-a88e-617e951c3099'::uuid,
  '870880d4-a6a5-5781-9698-cb4a4ee6b08f'::uuid,
  'babeb0dd-be32-5b1d-818e-655401623eac'::uuid,
  '8ed7d530-5037-53b3-8d0a-be79f47778bf'::uuid,
  '972245d9-72f6-5c7c-9a11-3b834e2976e0'::uuid,
  '8074c139-fe6f-56e5-84c5-ae4f247760bc'::uuid,
  'dcfada0d-dbd4-567c-b2c2-7ca2a5f390d6'::uuid,
  '9b8911bf-4fcc-5892-8e77-f98f0b069aba'::uuid,
  'b4d7ab84-a79e-5724-ae63-65c92f577067'::uuid,
  'c79cf1fe-131a-59e2-992b-1133e5778378'::uuid,
  'b223ce51-faf3-5c23-8e0f-7d92201c41e2'::uuid,
  '3a39a5bb-1ee0-56a9-b679-99306b0438d5'::uuid,
  'd4474115-e070-5c8d-92d0-e2248d7beb61'::uuid,
  'd3fa429e-23e3-5f0d-acfd-4b24033c5358'::uuid,
  'efb163af-c174-5d57-beb4-8ab92fad1556'::uuid,
  'f217822f-6443-5a9b-b048-757e7bff9cd6'::uuid,
  'db8febd6-2ade-5242-aac0-6bc5469141b1'::uuid,
  '7cb088ae-5e79-5b9b-9ee3-ed14944977cb'::uuid,
  '990624bc-c5c0-51ef-a1b9-15251b6b315e'::uuid,
  '58d4b8e1-7b94-5064-80d9-ab6a1e1d9ca4'::uuid,
  '80a00828-6a52-5304-aaaa-30ee6f2bf378'::uuid,
  'eb16038e-7e60-577d-9af0-798000fd0b3d'::uuid,
  'f8fb703d-78e9-5a0a-a533-440d72df1a8f'::uuid
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- ---------------------------------------------------------------------------
-- STUDENTS
-- ---------------------------------------------------------------------------
WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
seed_students AS (
  SELECT * FROM (VALUES
    ('92f22eed-838b-5194-b641-c2ebb6e581a2'::uuid, 'Jeetu Prajapat', 'jeetu.2550230@mygyanvihar.com', 'CA', 'Student', '2550230', 3),
    ('f26abb83-f6f3-5180-8ca1-dc9159867258'::uuid, 'Rushmita Sharma', 'rushmita.2451534@mygyanvihar.com', 'CA', 'Student', '2451534', 5),
    ('70379985-c294-5b88-9dff-57b78826d430'::uuid, 'Abhinav Rao', 'abhinav.2548770@mygyanvihar.com', 'ISBM', 'Student', '2548770', 3),
    ('0e135412-56fa-5ccb-9141-18fa4575d3ff'::uuid, 'Bhavna Mali', 'bhavna.2551701@mygyanvihar.com', 'ISBM', 'Student', '2551701', 3),
    ('ef460707-a4db-5069-8670-9fa9d08ebf68'::uuid, 'Julie Shekhawat', 'julie.2550140@mygyanvihar.com', 'ISBM', 'Student', '2550140', 3),
    ('fa166601-ae0d-5818-8c00-1c98ebc656c3'::uuid, 'Priyank Kaushik', 'priyank.2549343@mygyanvihar.com', 'ISBM', 'Student', '2549343', 3),
    ('8c031f8d-cd5a-5d25-aef0-b506a660e9e1'::uuid, 'Raghav Bhutra', 'raghav.2548583@mygyanvihar.com', 'ISBM', 'Student', '2548583', 3),
    ('c817264f-6cac-573a-8ccb-8394386f6c24'::uuid, 'Sandeep Kumar', 'sandeep.2453118@mygyanvihar.com', 'ISBM', 'Student', '2453118', 5),
    ('5c3c692d-b06d-5a38-80ec-d160e865a5c4'::uuid, 'Sunny', 'sunny.2453021@mygyanvihar.com', 'ISBM', 'Student', '2453021', 5),
    ('effef0bb-7494-5a3b-b058-42df61b7b44d'::uuid, 'Twinkle Adhikari', 'twinkle.2450021@mygyanvihar.com', 'ISBM', 'Student', '2450021', 5),
    ('a3e56a6b-8956-5ff4-a071-08e4d8c46194'::uuid, 'Yashashmini Sharma', 'yashashmini.2453623@mygyanvihar.com', 'ISBM', 'Student', '2453623', 5),
    ('d5e2be1b-58ac-55c7-918b-07b590f72b85'::uuid, 'Yatharth Mishra', 'yatharth.2548653@mygyanvihar.com', 'ISBM', 'Student', '2548653', 5),
    ('8ca5dc03-707b-5169-83b3-b3731b1ac4ce'::uuid, 'Mr Lakshya Jain', 'lakshya.2548727@mygyanvihar.com', 'Pharmacy', 'Student', '2548727', 3),
    ('fc78644c-5c7f-5b2d-8b13-c400fe1a6c06'::uuid, 'Mr Kartik Dangra', 'kartik.2549620@mygyanvihar.com', 'Pharmacy', 'Student', '2549620', 3),
    ('2ea40c2d-a1b1-552f-be5b-2c63231d72d7'::uuid, 'Mr Ashish Saini', 'ashish.2548715@mygyanvihar.com', 'Pharmacy', 'Student', '2548715', 3),
    ('e4586f25-1c13-54c0-90bd-c04aba0ae7ab'::uuid, 'Mr Vinit Kumar', 'vinit.2546632@mygyanvihar.com', 'Pharmacy', 'Student', '2546632', 3),
    ('de18101d-29d4-5ad7-b6f3-51c659aae314'::uuid, 'Mr Shubham Kumar Dubey', 'shubham.2547213@mygyanvihar.com', 'Pharmacy', 'Student', '2547213', 3),
    ('507eef36-f282-5d8c-8a2b-d75d077e10de'::uuid, 'Mr Akshit Kr Sharma', 'akshit.2548729@mygyanvihar.com', 'Pharmacy', 'Student', '2548729', 3),
    ('f48caefd-6ea7-5fe7-a7ad-31470e65e893'::uuid, 'Mr Nakul Gaur', 'nakul.2448315@mygyanvihar.com', 'Pharmacy', 'Student', '2448315', 5),
    ('ffa366a7-ecda-5adb-ab0b-2de00f32e467'::uuid, 'Mr Tejasva Dulani', 'tejasva.2449080@mygyanvihar.com', 'Pharmacy', 'Student', '2449080', 5),
    ('9c9cf74f-5d04-5e78-a30b-e0225526378c'::uuid, 'Ms Arshi Bhati', 'arshi.2451125@mygyanvihar.com', 'Pharmacy', 'Student', '2451125', 5),
    ('1ace525c-77fe-52c5-b791-f1610467ce9a'::uuid, 'Ms Sristhi Paarashar', 'srishti.2451136@mygyanvihar.com', 'Pharmacy', 'Student', '2451136', 5),
    ('326c1841-70bb-551c-8055-11a14965c1c4'::uuid, 'Ms Muskan Kumari', 'muskan.2450354@mygyanvihar.com', 'Pharmacy', 'Student', '2450354', 5),
    ('03b45498-d549-5c4e-a0a9-41ce568d17fa'::uuid, 'Ms Deepika', 'deepika.2346664@mygyanvihar.com', 'Pharmacy', 'Student', '2346664', 7),
    ('841ba156-4070-56d8-bb9b-0949c23fed42'::uuid, 'Mr Rahul Kumar Swami', 'rahul.2346233@mygyanvihar.com', 'Pharmacy', 'Student', '2346233', 7),
    ('dbd54a09-e962-5dd7-b292-c05387ba6aa5'::uuid, 'Ms Tisha Dashora', 'tisha.2346536@mygyanvihar.com', 'Pharmacy', 'Student', '2346536', 7),
    ('aea01756-6e9b-5316-a4fc-c69ddcdd3795'::uuid, 'Mr Bhavishya Kumar', 'bhavishya.23181424@mygyanvihar.com', 'Pharmacy', 'Student', '23181424', 7),
    ('1da2fea9-848a-5caf-a599-c42e6941f8de'::uuid, 'Mr Sandeep Kumar Sharma', 'sandeep.23180646@mygyanvihar.com', 'Pharmacy', 'Student', '23180646', 7),
    ('a161ff86-43a5-5929-ac67-c12171c7a730'::uuid, 'Mr Praveen Kumar', 'praveen.23181521@mygyanvihar.com', 'Pharmacy', 'Student', '23181521', 7),
    ('c88b692b-74f8-5146-91b4-0e79156e1b02'::uuid, 'Ms. AAROHI GAUTTAM', 'aarohi.2549573@mygyanvihar.com', 'SILS', 'Student', '2549573', 3),
    ('1a12b875-ed29-5526-b3c3-1343d574ac72'::uuid, 'Ms. AVANTIKA', 'avantika.2550119@mygyanvihar.com', 'SILS', 'Student', '2550119', 3),
    ('6c5f727b-59ca-57ca-a09c-ec5f594c0af5'::uuid, 'Ms. SHALU', 'shallu.2548774@mygyanvihar.com', 'SILS', 'Student', '2548774', 3),
    ('2512fc80-6e91-5f02-9be0-0d9bcadf5aaa'::uuid, 'Ms BHAVYA', 'abhishek.2449100@mygyanvihar.com', 'SILS', 'Student', '2449100', 5),
    ('d758a13b-8b8d-5c03-8ff5-57fd14fe833f'::uuid, 'Ms PREKSHA', 'preksha.2347426@mygyanvihar.com', 'SILS', 'Student', '2347426', 7),
    ('512652b5-8e54-53fa-8efa-5d5458895ae9'::uuid, 'Mr AMIT CHAWALA', 'amit.23182830@mygyanvihar.com', 'SILS', 'Student', '23182830', 7),
    ('51ceeed8-8364-5f6c-b565-73d7e48b35c1'::uuid, 'Abhinav Goel', 'abhinav.2547028@mygyanvihar.com', 'C3WR', 'Student', '2547028', 3),
    ('fc0ac81b-3382-53e3-8726-03912bab6bab'::uuid, 'Santanu Sarkar', 'santanu.2547205@mygyanvihar.com', 'C3WR', 'Student', '2547205', 3),
    ('91e39e0a-9af7-55ce-af14-f72e2b8e874a'::uuid, 'Manisha choudhary', 'manisha.2550362@mygyanvihar.com', 'C3WR', 'Student', '2550362', 3),
    ('c12efcb2-68a6-5fc9-8a4c-d97255b591fe'::uuid, 'Harshit Singh', 'harshit.2550366@mygyanvihar.com', 'C3WR', 'Student', '2550366', 3),
    ('19cbdd5f-c60b-53f8-891c-380788243922'::uuid, 'Prasen Kumar Singh', 'prasen.2551118@mygyanvihar.com', 'C3WR', 'Student', '2551118', 3),
    ('81e43f38-ae11-59ec-8fd2-709bac141c51'::uuid, 'Chandrakanta Suman', 'chandrakanta.2550323@mygyanvihar.com', 'C3WR', 'Student', '2550323', 3),
    ('d63abfe5-c910-5645-a29d-c1aede9975c6'::uuid, 'Ninjal', 'ninjal.2549590@mygyanvihar.com', 'Applied Sciences', 'Student', '2549590', 3),
    ('f5752c37-0ec7-5553-962f-1e72c41381c9'::uuid, 'Kanika Gautam', 'kanika.2549940@mygyanvihar.com', 'Applied Sciences', 'Student', '2549940', 3),
    ('705b00c2-c0be-5958-ab98-e8bb9b188921'::uuid, 'Ayasha Yadav', 'ayasha.2550917@mygyanvihar.com', 'Applied Sciences', 'Student', '2550917', 3),
    ('cd59be08-8085-50b6-aa10-9e4551e93a36'::uuid, 'Keshav Gupta', 'keshav.2454525@mygyanvihar.com', 'Applied Sciences', 'Student', '2454525', 5),
    ('6dd1c1eb-7f83-5a02-816f-69ccf8856625'::uuid, 'Vesika Singh', 'vesika.2455064@mygyanvihar.com', 'Applied Sciences', 'Student', '2455064', 5),
    ('93c46cd4-cc4f-5c41-8195-44613ea542f8'::uuid, 'Vaibhav Singh Thakur', 'vaibhav.2455725@mygyanvihar.com', 'Applied Sciences', 'Student', '2455725', 5),
    ('07eea688-d2a1-5146-83b6-01a1ab495fda'::uuid, 'Anshuman Singh', 'anshuman.2549873@mygyanvihar.com', 'Mech Engg', 'Student', '2549873', 3),
    ('2449269d-d3d1-5dbb-bbc6-b0d798add350'::uuid, 'Jalaj Bansal', 'jalaj.2550454@mygyanvihar.com', 'Mech Engg', 'Student', '2550454', 3),
    ('2970ec25-d697-50b9-8915-e558b9e09fb0'::uuid, 'Sunil Kumar', 'sunil.2455672@mygyanvihar.com', 'Mech Engg', 'Student', '2455672', 5),
    ('e55486c1-6a90-5cd2-b01a-f5da03873bde'::uuid, 'Ravi Raj', 'raviraj.2455903@mygyanvihar.com', 'Mech Engg', 'Student', '2455903', 5),
    ('f57adeb1-b780-5627-b9bd-47bcc12f9a16'::uuid, 'Yash Singh', 'yash.23180717@mygyanvihar.com', 'Mech Engg', 'Student', '23180717', 7),
    ('f3ad5956-1757-5c0a-b4b5-de17028dff5e'::uuid, 'Ravi Kumar', 'ravi.2345541@mygyanvihar.com', 'Mech Engg', 'Student', '2345541', 7),
    ('8730d425-91df-5220-b548-bb907dbbc169'::uuid, 'Akansha Choudhary', 'akansha.2548056@mygyanvihar.com', 'BPT', 'Student', '2548056', 3),
    ('7cab5c3e-a8f8-5540-845c-a19c529d6d7f'::uuid, 'Shubham Kumar Nayak', 'shubham.2545066@mygyanvihar.com', 'BPT', 'Student', '2545066', 3),
    ('5f6ae19a-ba3b-5af6-ac4b-c377eebe2e1f'::uuid, 'Parul Kumawat', 'parul.2548732@mygyanvihar.com', 'BPT', 'Student', '2548732', 3),
    ('ebf7ddd7-399c-581a-8bee-d09587c8b090'::uuid, 'Vidit Grover', 'vidit.2550388@mygyanvihar.com', 'BPT', 'Student', '2550388', 3),
    ('76db4fb9-c15f-55e8-a2d7-a7e6581d905f'::uuid, 'Anshu Nandini', 'anshu.2453216@mygyanvihar.com', 'BPT', 'Student', '2453216', 5),
    ('eb5ff1b6-4d70-56c9-9c38-cbdd8a966204'::uuid, 'Prabhat', 'prabhat.2455789@mygyanvihar.com', 'BPT', 'Student', '2455789', 5),
    ('50213186-4c28-50e2-b7d7-36882745ddaa'::uuid, 'Mansi', 'mansi.2455266@mygyanvihar.com', 'BPT', 'Student', '2455266', 5),
    ('289661c5-8be8-5ac4-83d5-717ba31846b2'::uuid, 'Naveen Kumar', 'naveen.2455788@mygyanvihar.com', 'BPT', 'Student', '2455788', 5),
    ('20ed8ffa-d0ec-5232-b614-fec3f5f01729'::uuid, 'Harendra', 'harendra.2455633@mygyanvihar.com', 'BPT', 'Student', '2455633', 5),
    ('514bc8f3-7d52-5bd6-a33e-84e8fae74351'::uuid, 'Bhumi Rathore', 'bhumi.2548545@mygyanvihar.com', 'GCAD', 'Student', '2548545', 3),
    ('2012afcb-2e2e-5198-aad6-f9e37def5645'::uuid, 'Priya', 'priya.2550245@mygyanvihar.com', 'GCAD', 'Student', '2550245', 3),
    ('75863e2e-0a92-5d8a-854d-fc8dd8244b98'::uuid, 'Roop Singh', 'roop.2548471@mygyanvihar.com', 'Civil', 'Student', '2548471', 3),
    ('ff8601a3-19bb-5c8c-824f-53a6c7b0846e'::uuid, 'Somya', 'somya.2547552@mygyanvihar.com', 'Civil', 'Student', '2547552', 3),
    ('a7cd54c8-b792-5ed7-a14e-c2d483c14adc'::uuid, 'Lokesh Kumar', 'lokesh.2549010@mygyanvihar.com', 'Civil', 'Student', '2549010', 5),
    ('a03f74a3-ed11-574b-9bef-3ce9cea956ca'::uuid, 'Gaurav Swami', 'gaurav.2451540@mygyanvihar.com', 'Civil', 'Student', '2451540', 5),
    ('d20dee82-13f1-56a8-b8bc-7e4d19326816'::uuid, 'Naveen Kumar', 'naveen.2453524@mygyanvihar.com', 'Civil', 'Student', '2453524', 5),
    ('47203e7f-d8a5-5948-a040-adfc748c02e1'::uuid, 'Ayush Raj', 'ayush.2456444@mygyanvihar.com', 'Civil', 'Student', '2456444', 7),
    ('3e24a047-788c-59a5-8fe3-e7cabb3a7b39'::uuid, 'Tareem', 'tareem.23181429@mygyanvihar.com', 'Civil', 'Student', '23181429', 7),
    ('f0447e47-e22c-5fcc-b5e1-9a06efe95aa5'::uuid, 'Priyanshi Sharma', 'priyanshi.2548532@mygyanvihar.com', 'Law', 'Student', '2548532', 3),
    ('8de1ce44-d38f-5958-bee8-9eb433bb6731'::uuid, 'Alok Kumar', 'alok.2547955@mygyanvihar.com', 'Law', 'Student', '2547955', 3),
    ('317e929c-b3bb-5fca-bdb1-e4d631f88314'::uuid, 'Fiza Bano', 'fiza.2548686@mygyanvihar.com', 'Law', 'Student', '2548686', 3),
    ('15e19d2a-0270-520d-81a1-cd7637ab1d9a'::uuid, 'Gaurav Sharma', 'gaurav.2547303@mygyanvihar.com', 'Law', 'Student', '2547303', 3),
    ('c56b3c70-bf87-546f-b86a-ba362676dda5'::uuid, 'Keshav Sharma', 'keshav.2548874@mygyanvihar.com', 'Law', 'Student', '2548874', 3),
    ('808ff7fd-b922-5cff-b4c7-42a0af8ad297'::uuid, 'Syed aaquil', 'syed.2455905@mygyanvihar.com', 'Law', 'Student', '2455905', 5),
    ('66c75024-c2a1-5a59-882c-fa6f599b0e7e'::uuid, 'GAURAV SAHA', 'gaurav.2449873@mygyanvihar.com', 'Law', 'Student', '2449873', 5),
    ('4cca75a0-9c2b-5401-a0eb-31fd36768277'::uuid, 'FARMAN KHAN', 'farman.2452992@mygyanvihar.com', 'Law', 'Student', '2452992', 5),
    ('610d9449-d563-56b8-b9fc-81d52774e57f'::uuid, 'SATYAM KUMAR', 'satyam.2455904@mygyanvihar.com', 'Law', 'Student', '2455904', 5),
    ('eccb7417-e122-5c13-8961-a8c033f14f5b'::uuid, 'SHAHIB KHAN', 'shahib.2452993@mygyanvihar.com', 'Law', 'Student', '2452993', 5),
    ('ead751e6-87fe-5027-a1d7-f371aa586a6b'::uuid, 'Dheeraj', 'dheeraj.23181663@mygyanvihar.com', 'Law', 'Student', '23181663', 7),
    ('debad63c-2f34-5930-8601-aaa3994b4c16'::uuid, 'URMILA BAIRWA', 'urmila.23182011@mygyanvihar.com', 'Law', 'Student', '23182011', 7),
    ('9ba36658-c2e6-5271-a1bd-fc2419c1ac37'::uuid, 'TANISHKA SADH', 'tanishka.2346187@mygyanvihar.com', 'Law', 'Student', '2346187', 7),
    ('160e1244-9baf-5168-ad5f-0720c29a25bb'::uuid, 'SUSHMA BHARTI', 'sushma.23183202@mygyanvihar.com', 'Law', 'Student', '23183202', 7),
    ('4e02eb2a-bb1c-5fd7-ac00-f31f489e66ea'::uuid, 'LALIT BANSIWAL', 'lalit.23181837@mygyanvihar.com', 'Law', 'Student', '23181837', 7),
    ('f95477c9-0fdf-5068-ac1c-b5ca70ca52e5'::uuid, 'Ms.Urvashi Meena', 'urvashi.2549847@mygyanvihar.com', 'Education', 'Student', '2549847', 3),
    ('3a9ded23-ee40-5a88-ada3-676b9c427c13'::uuid, 'Anushka kumari mahawar', 'anushka.2549868@mygyanvihar.com', 'Education', 'Student', '2549868', 3),
    ('dfe54260-3452-59f7-b7f9-d9022db99251'::uuid, 'Rajeshwari Gurjar', 'rajeshwari.2550093@mygyanvihar.com', 'Education', 'Student', '2550093', 3),
    ('502e9e12-1eb8-5b39-b168-333d5302e29e'::uuid, 'Payal Meena', 'payal.2550549@mygyanvihar.com', 'Education', 'Student', '2550549', 3),
    ('48acb644-693d-5da8-a930-91aacb36ffa1'::uuid, 'Diya Mehra', 'diya.2549828@mygyanvihar.com', 'Education', 'Student', '2549828', 3),
    ('7074d911-6a3b-54fe-a2db-2c77554a02c6'::uuid, 'Ajay raj singh', 'ajay.2452986@mygyanvihar.com', 'Education', 'Student', '2452986', 5),
    ('7daafec3-1d00-5125-9450-081c261e62d3'::uuid, 'Ansh Akhilesh meena', 'ansh.2452910@mygyanvihar.com', 'Education', 'Student', '2452910', 5),
    ('c0ccd974-81c1-5a84-b59b-4bff150c60e9'::uuid, 'Ansh pratap singh', 'ansh.2452976@mygyanvihar.com', 'Education', 'Student', '2452976', 5),
    ('93d04db9-2ed9-584f-b789-fe5cbe0ae892'::uuid, 'Ashish aaloriya', 'ashish.2453244@mygyanvihar.com', 'Education', 'Student', '2453244', 5),
    ('0ed11759-21ca-51bb-9c9a-0545547d13ac'::uuid, 'Balraj meena', 'balraj.2454139@mygyanvihar.com', 'Education', 'Student', '2454139', 5),
    ('42f3cc2c-2a29-5843-b4c1-b5b9050e1ff9'::uuid, 'Manish', 'manish.23181674@mygyanvihar.com', 'Education', 'Student', '23181674', 7),
    ('c69c4a8b-04df-5be8-9fe7-bceaed9a8042'::uuid, 'surabh', 'surabh.23180554@mygyanvihar.com', 'Education', 'Student', '23180554', 7),
    ('04b1cd46-948c-5109-8a2b-c81a2f82008e'::uuid, 'Sanjeev Meena', 'sanjeev.23181724@mygyanvihar.com', 'Education', 'Student', '23181724', 7),
    ('476688dd-c101-55a3-8405-ff747fe1df98'::uuid, 'Deepak', 'deepak.23180596@mygyanvihar.com', 'Education', 'Student', '23180596', 7),
    ('ee4b6a55-c479-52a6-9d29-cd956d0065c0'::uuid, 'Deepak Tanwar', 'deepak.23181628@mygyanvihar.com', 'Education', 'Student', '23181628', 7),
    ('1fc80bfb-882a-5fc8-8d4e-e1511cf84038'::uuid, 'kasak kanwar', 'kasak.23182369@mygyanvihar.com', 'Agriculture', 'Student', '23182369', NULL),
    ('423e5cbd-9f7b-5efb-9de4-f04a4cddc190'::uuid, 'himanshu mali', 'himanshu.23181124@mygyanvihar.com', 'Agriculture', 'Student', '23181124', NULL),
    ('be301307-784c-5e6b-b23c-0b56ff8ab275'::uuid, 'jay kumar roy', 'jaykumar.23181408@mygyanvihar.com', 'Agriculture', 'Student', '23181408', NULL),
    ('c7945bc6-09c8-53e9-ac97-860658ece187'::uuid, 'tanushree patidar', 'tanushre.23182587@mygyanvihar.com', 'Agriculture', 'Student', '23182587', NULL),
    ('4cc529e6-bea4-5542-a699-856101101d1d'::uuid, 'Sara Jeelani', 'sara.23178477@mygyanvihar.com', 'Agriculture', 'Student', '23178477', NULL),
    ('e0a70a3e-aee5-5774-a2b3-b56a1c97d5ea'::uuid, 'shruti singh', 'shruti.2453893@mygyanvihar.com', 'Agriculture', 'Student', '2453893', NULL),
    ('cf2db38d-47f8-58cd-b272-38fe9bb78a43'::uuid, 'chahat', 'chahat.2454864@mygyanvihar.com', 'Agriculture', 'Student', '2454864', NULL),
    ('7911417d-513d-5296-bf2e-79671b937e7c'::uuid, 'Apurva vaishnavi', 'apurva.2453892@mygyanvihar.com', 'Agriculture', 'Student', '2453892', NULL),
    ('c48509ce-d0c3-57a8-8398-967a90ccc7ad'::uuid, 'dinesh choudhary', 'dinesh.2455330@mygyanvihar.com', 'Agriculture', 'Student', '2455330', NULL),
    ('beaf8a42-531e-5b11-80ae-dd9222c6f75d'::uuid, 'divyakumar', 'divya.2454465@mygyanvihar.com', 'Agriculture', 'Student', '2454465', NULL),
    ('68799ab1-38ad-5293-a685-2cb7d01e10f1'::uuid, 'Ashish kumar', 'ashish.2551126@mygyanvihar.com', 'Agriculture', 'Student', '2551126', 3),
    ('498f66ab-47c7-504c-a6ba-720e1a962ec5'::uuid, 'ashish sharma', 'ashish.2550342@mygyanvihar.com', 'Agriculture', 'Student', '2550342', 3),
    ('3f186218-2c6a-5daf-bad0-81ece36a8a07'::uuid, 'ayush meena', 'ayush.2552687@mygyanvihar.com', 'Agriculture', 'Student', '2552687', 3)
  ) AS s(user_id, name, email, dept_name, role_name, enrollment_no, semester_num)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id, dept_id,
  password_hash, is_active, onboarding_status, onboarding_profile
)
SELECT
  s.user_id, t.tenant_id, s.name, s.email, r.role_id, d.dept_id,
  p.hash, true, 'PENDING_PASSWORD_RESET', '{}'::jsonb
FROM seed_students s
CROSS JOIN tenant t
CROSS JOIN pwd p
JOIN departments d ON d.dept_name = s.dept_name
JOIN roles r ON r.role_name = 'Student'
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  dept_id = EXCLUDED.dept_id,
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  onboarding_status = 'PENDING_PASSWORD_RESET',
  onboarding_profile = '{}'::jsonb;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
WHERE u.user_id IN (
  '92f22eed-838b-5194-b641-c2ebb6e581a2'::uuid,
  'f26abb83-f6f3-5180-8ca1-dc9159867258'::uuid,
  '70379985-c294-5b88-9dff-57b78826d430'::uuid,
  '0e135412-56fa-5ccb-9141-18fa4575d3ff'::uuid,
  'ef460707-a4db-5069-8670-9fa9d08ebf68'::uuid,
  'fa166601-ae0d-5818-8c00-1c98ebc656c3'::uuid,
  '8c031f8d-cd5a-5d25-aef0-b506a660e9e1'::uuid,
  'c817264f-6cac-573a-8ccb-8394386f6c24'::uuid,
  '5c3c692d-b06d-5a38-80ec-d160e865a5c4'::uuid,
  'effef0bb-7494-5a3b-b058-42df61b7b44d'::uuid,
  'a3e56a6b-8956-5ff4-a071-08e4d8c46194'::uuid,
  'd5e2be1b-58ac-55c7-918b-07b590f72b85'::uuid,
  '8ca5dc03-707b-5169-83b3-b3731b1ac4ce'::uuid,
  'fc78644c-5c7f-5b2d-8b13-c400fe1a6c06'::uuid,
  '2ea40c2d-a1b1-552f-be5b-2c63231d72d7'::uuid,
  'e4586f25-1c13-54c0-90bd-c04aba0ae7ab'::uuid,
  'de18101d-29d4-5ad7-b6f3-51c659aae314'::uuid,
  '507eef36-f282-5d8c-8a2b-d75d077e10de'::uuid,
  'f48caefd-6ea7-5fe7-a7ad-31470e65e893'::uuid,
  'ffa366a7-ecda-5adb-ab0b-2de00f32e467'::uuid,
  '9c9cf74f-5d04-5e78-a30b-e0225526378c'::uuid,
  '1ace525c-77fe-52c5-b791-f1610467ce9a'::uuid,
  '326c1841-70bb-551c-8055-11a14965c1c4'::uuid,
  '03b45498-d549-5c4e-a0a9-41ce568d17fa'::uuid,
  '841ba156-4070-56d8-bb9b-0949c23fed42'::uuid,
  'dbd54a09-e962-5dd7-b292-c05387ba6aa5'::uuid,
  'aea01756-6e9b-5316-a4fc-c69ddcdd3795'::uuid,
  '1da2fea9-848a-5caf-a599-c42e6941f8de'::uuid,
  'a161ff86-43a5-5929-ac67-c12171c7a730'::uuid,
  'c88b692b-74f8-5146-91b4-0e79156e1b02'::uuid,
  '1a12b875-ed29-5526-b3c3-1343d574ac72'::uuid,
  '6c5f727b-59ca-57ca-a09c-ec5f594c0af5'::uuid,
  '2512fc80-6e91-5f02-9be0-0d9bcadf5aaa'::uuid,
  'd758a13b-8b8d-5c03-8ff5-57fd14fe833f'::uuid,
  '512652b5-8e54-53fa-8efa-5d5458895ae9'::uuid,
  '51ceeed8-8364-5f6c-b565-73d7e48b35c1'::uuid,
  'fc0ac81b-3382-53e3-8726-03912bab6bab'::uuid,
  '91e39e0a-9af7-55ce-af14-f72e2b8e874a'::uuid,
  'c12efcb2-68a6-5fc9-8a4c-d97255b591fe'::uuid,
  '19cbdd5f-c60b-53f8-891c-380788243922'::uuid,
  '81e43f38-ae11-59ec-8fd2-709bac141c51'::uuid,
  'd63abfe5-c910-5645-a29d-c1aede9975c6'::uuid,
  'f5752c37-0ec7-5553-962f-1e72c41381c9'::uuid,
  '705b00c2-c0be-5958-ab98-e8bb9b188921'::uuid,
  'cd59be08-8085-50b6-aa10-9e4551e93a36'::uuid,
  '6dd1c1eb-7f83-5a02-816f-69ccf8856625'::uuid,
  '93c46cd4-cc4f-5c41-8195-44613ea542f8'::uuid,
  '07eea688-d2a1-5146-83b6-01a1ab495fda'::uuid,
  '2449269d-d3d1-5dbb-bbc6-b0d798add350'::uuid,
  '2970ec25-d697-50b9-8915-e558b9e09fb0'::uuid,
  'e55486c1-6a90-5cd2-b01a-f5da03873bde'::uuid,
  'f57adeb1-b780-5627-b9bd-47bcc12f9a16'::uuid,
  'f3ad5956-1757-5c0a-b4b5-de17028dff5e'::uuid,
  '8730d425-91df-5220-b548-bb907dbbc169'::uuid,
  '7cab5c3e-a8f8-5540-845c-a19c529d6d7f'::uuid,
  '5f6ae19a-ba3b-5af6-ac4b-c377eebe2e1f'::uuid,
  'ebf7ddd7-399c-581a-8bee-d09587c8b090'::uuid,
  '76db4fb9-c15f-55e8-a2d7-a7e6581d905f'::uuid,
  'eb5ff1b6-4d70-56c9-9c38-cbdd8a966204'::uuid,
  '50213186-4c28-50e2-b7d7-36882745ddaa'::uuid,
  '289661c5-8be8-5ac4-83d5-717ba31846b2'::uuid,
  '20ed8ffa-d0ec-5232-b614-fec3f5f01729'::uuid,
  '514bc8f3-7d52-5bd6-a33e-84e8fae74351'::uuid,
  '2012afcb-2e2e-5198-aad6-f9e37def5645'::uuid,
  '75863e2e-0a92-5d8a-854d-fc8dd8244b98'::uuid,
  'ff8601a3-19bb-5c8c-824f-53a6c7b0846e'::uuid,
  'a7cd54c8-b792-5ed7-a14e-c2d483c14adc'::uuid,
  'a03f74a3-ed11-574b-9bef-3ce9cea956ca'::uuid,
  'd20dee82-13f1-56a8-b8bc-7e4d19326816'::uuid,
  '47203e7f-d8a5-5948-a040-adfc748c02e1'::uuid,
  '3e24a047-788c-59a5-8fe3-e7cabb3a7b39'::uuid,
  'f0447e47-e22c-5fcc-b5e1-9a06efe95aa5'::uuid,
  '8de1ce44-d38f-5958-bee8-9eb433bb6731'::uuid,
  '317e929c-b3bb-5fca-bdb1-e4d631f88314'::uuid,
  '15e19d2a-0270-520d-81a1-cd7637ab1d9a'::uuid,
  'c56b3c70-bf87-546f-b86a-ba362676dda5'::uuid,
  '808ff7fd-b922-5cff-b4c7-42a0af8ad297'::uuid,
  '66c75024-c2a1-5a59-882c-fa6f599b0e7e'::uuid,
  '4cca75a0-9c2b-5401-a0eb-31fd36768277'::uuid,
  '610d9449-d563-56b8-b9fc-81d52774e57f'::uuid,
  'eccb7417-e122-5c13-8961-a8c033f14f5b'::uuid,
  'ead751e6-87fe-5027-a1d7-f371aa586a6b'::uuid,
  'debad63c-2f34-5930-8601-aaa3994b4c16'::uuid,
  '9ba36658-c2e6-5271-a1bd-fc2419c1ac37'::uuid,
  '160e1244-9baf-5168-ad5f-0720c29a25bb'::uuid,
  '4e02eb2a-bb1c-5fd7-ac00-f31f489e66ea'::uuid,
  'f95477c9-0fdf-5068-ac1c-b5ca70ca52e5'::uuid,
  '3a9ded23-ee40-5a88-ada3-676b9c427c13'::uuid,
  'dfe54260-3452-59f7-b7f9-d9022db99251'::uuid,
  '502e9e12-1eb8-5b39-b168-333d5302e29e'::uuid,
  '48acb644-693d-5da8-a930-91aacb36ffa1'::uuid,
  '7074d911-6a3b-54fe-a2db-2c77554a02c6'::uuid,
  '7daafec3-1d00-5125-9450-081c261e62d3'::uuid,
  'c0ccd974-81c1-5a84-b59b-4bff150c60e9'::uuid,
  '93d04db9-2ed9-584f-b789-fe5cbe0ae892'::uuid,
  '0ed11759-21ca-51bb-9c9a-0545547d13ac'::uuid,
  '42f3cc2c-2a29-5843-b4c1-b5b9050e1ff9'::uuid,
  'c69c4a8b-04df-5be8-9fe7-bceaed9a8042'::uuid,
  '04b1cd46-948c-5109-8a2b-c81a2f82008e'::uuid,
  '476688dd-c101-55a3-8405-ff747fe1df98'::uuid,
  'ee4b6a55-c479-52a6-9d29-cd956d0065c0'::uuid,
  '1fc80bfb-882a-5fc8-8d4e-e1511cf84038'::uuid,
  '423e5cbd-9f7b-5efb-9de4-f04a4cddc190'::uuid,
  'be301307-784c-5e6b-b23c-0b56ff8ab275'::uuid,
  'c7945bc6-09c8-53e9-ac97-860658ece187'::uuid,
  '4cc529e6-bea4-5542-a699-856101101d1d'::uuid,
  'e0a70a3e-aee5-5774-a2b3-b56a1c97d5ea'::uuid,
  'cf2db38d-47f8-58cd-b272-38fe9bb78a43'::uuid,
  '7911417d-513d-5296-bf2e-79671b937e7c'::uuid,
  'c48509ce-d0c3-57a8-8398-967a90ccc7ad'::uuid,
  'beaf8a42-531e-5b11-80ae-dd9222c6f75d'::uuid,
  '68799ab1-38ad-5293-a685-2cb7d01e10f1'::uuid,
  '498f66ab-47c7-504c-a6ba-720e1a962ec5'::uuid,
  '3f186218-2c6a-5daf-bad0-81ece36a8a07'::uuid
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

WITH seed_students AS (
  SELECT * FROM (VALUES
    ('92f22eed-838b-5194-b641-c2ebb6e581a2'::uuid, 'Jeetu Prajapat', 'jeetu.2550230@mygyanvihar.com', 'CA', 'Student', '2550230', 3),
    ('f26abb83-f6f3-5180-8ca1-dc9159867258'::uuid, 'Rushmita Sharma', 'rushmita.2451534@mygyanvihar.com', 'CA', 'Student', '2451534', 5),
    ('70379985-c294-5b88-9dff-57b78826d430'::uuid, 'Abhinav Rao', 'abhinav.2548770@mygyanvihar.com', 'ISBM', 'Student', '2548770', 3),
    ('0e135412-56fa-5ccb-9141-18fa4575d3ff'::uuid, 'Bhavna Mali', 'bhavna.2551701@mygyanvihar.com', 'ISBM', 'Student', '2551701', 3),
    ('ef460707-a4db-5069-8670-9fa9d08ebf68'::uuid, 'Julie Shekhawat', 'julie.2550140@mygyanvihar.com', 'ISBM', 'Student', '2550140', 3),
    ('fa166601-ae0d-5818-8c00-1c98ebc656c3'::uuid, 'Priyank Kaushik', 'priyank.2549343@mygyanvihar.com', 'ISBM', 'Student', '2549343', 3),
    ('8c031f8d-cd5a-5d25-aef0-b506a660e9e1'::uuid, 'Raghav Bhutra', 'raghav.2548583@mygyanvihar.com', 'ISBM', 'Student', '2548583', 3),
    ('c817264f-6cac-573a-8ccb-8394386f6c24'::uuid, 'Sandeep Kumar', 'sandeep.2453118@mygyanvihar.com', 'ISBM', 'Student', '2453118', 5),
    ('5c3c692d-b06d-5a38-80ec-d160e865a5c4'::uuid, 'Sunny', 'sunny.2453021@mygyanvihar.com', 'ISBM', 'Student', '2453021', 5),
    ('effef0bb-7494-5a3b-b058-42df61b7b44d'::uuid, 'Twinkle Adhikari', 'twinkle.2450021@mygyanvihar.com', 'ISBM', 'Student', '2450021', 5),
    ('a3e56a6b-8956-5ff4-a071-08e4d8c46194'::uuid, 'Yashashmini Sharma', 'yashashmini.2453623@mygyanvihar.com', 'ISBM', 'Student', '2453623', 5),
    ('d5e2be1b-58ac-55c7-918b-07b590f72b85'::uuid, 'Yatharth Mishra', 'yatharth.2548653@mygyanvihar.com', 'ISBM', 'Student', '2548653', 5),
    ('8ca5dc03-707b-5169-83b3-b3731b1ac4ce'::uuid, 'Mr Lakshya Jain', 'lakshya.2548727@mygyanvihar.com', 'Pharmacy', 'Student', '2548727', 3),
    ('fc78644c-5c7f-5b2d-8b13-c400fe1a6c06'::uuid, 'Mr Kartik Dangra', 'kartik.2549620@mygyanvihar.com', 'Pharmacy', 'Student', '2549620', 3),
    ('2ea40c2d-a1b1-552f-be5b-2c63231d72d7'::uuid, 'Mr Ashish Saini', 'ashish.2548715@mygyanvihar.com', 'Pharmacy', 'Student', '2548715', 3),
    ('e4586f25-1c13-54c0-90bd-c04aba0ae7ab'::uuid, 'Mr Vinit Kumar', 'vinit.2546632@mygyanvihar.com', 'Pharmacy', 'Student', '2546632', 3),
    ('de18101d-29d4-5ad7-b6f3-51c659aae314'::uuid, 'Mr Shubham Kumar Dubey', 'shubham.2547213@mygyanvihar.com', 'Pharmacy', 'Student', '2547213', 3),
    ('507eef36-f282-5d8c-8a2b-d75d077e10de'::uuid, 'Mr Akshit Kr Sharma', 'akshit.2548729@mygyanvihar.com', 'Pharmacy', 'Student', '2548729', 3),
    ('f48caefd-6ea7-5fe7-a7ad-31470e65e893'::uuid, 'Mr Nakul Gaur', 'nakul.2448315@mygyanvihar.com', 'Pharmacy', 'Student', '2448315', 5),
    ('ffa366a7-ecda-5adb-ab0b-2de00f32e467'::uuid, 'Mr Tejasva Dulani', 'tejasva.2449080@mygyanvihar.com', 'Pharmacy', 'Student', '2449080', 5),
    ('9c9cf74f-5d04-5e78-a30b-e0225526378c'::uuid, 'Ms Arshi Bhati', 'arshi.2451125@mygyanvihar.com', 'Pharmacy', 'Student', '2451125', 5),
    ('1ace525c-77fe-52c5-b791-f1610467ce9a'::uuid, 'Ms Sristhi Paarashar', 'srishti.2451136@mygyanvihar.com', 'Pharmacy', 'Student', '2451136', 5),
    ('326c1841-70bb-551c-8055-11a14965c1c4'::uuid, 'Ms Muskan Kumari', 'muskan.2450354@mygyanvihar.com', 'Pharmacy', 'Student', '2450354', 5),
    ('03b45498-d549-5c4e-a0a9-41ce568d17fa'::uuid, 'Ms Deepika', 'deepika.2346664@mygyanvihar.com', 'Pharmacy', 'Student', '2346664', 7),
    ('841ba156-4070-56d8-bb9b-0949c23fed42'::uuid, 'Mr Rahul Kumar Swami', 'rahul.2346233@mygyanvihar.com', 'Pharmacy', 'Student', '2346233', 7),
    ('dbd54a09-e962-5dd7-b292-c05387ba6aa5'::uuid, 'Ms Tisha Dashora', 'tisha.2346536@mygyanvihar.com', 'Pharmacy', 'Student', '2346536', 7),
    ('aea01756-6e9b-5316-a4fc-c69ddcdd3795'::uuid, 'Mr Bhavishya Kumar', 'bhavishya.23181424@mygyanvihar.com', 'Pharmacy', 'Student', '23181424', 7),
    ('1da2fea9-848a-5caf-a599-c42e6941f8de'::uuid, 'Mr Sandeep Kumar Sharma', 'sandeep.23180646@mygyanvihar.com', 'Pharmacy', 'Student', '23180646', 7),
    ('a161ff86-43a5-5929-ac67-c12171c7a730'::uuid, 'Mr Praveen Kumar', 'praveen.23181521@mygyanvihar.com', 'Pharmacy', 'Student', '23181521', 7),
    ('c88b692b-74f8-5146-91b4-0e79156e1b02'::uuid, 'Ms. AAROHI GAUTTAM', 'aarohi.2549573@mygyanvihar.com', 'SILS', 'Student', '2549573', 3),
    ('1a12b875-ed29-5526-b3c3-1343d574ac72'::uuid, 'Ms. AVANTIKA', 'avantika.2550119@mygyanvihar.com', 'SILS', 'Student', '2550119', 3),
    ('6c5f727b-59ca-57ca-a09c-ec5f594c0af5'::uuid, 'Ms. SHALU', 'shallu.2548774@mygyanvihar.com', 'SILS', 'Student', '2548774', 3),
    ('2512fc80-6e91-5f02-9be0-0d9bcadf5aaa'::uuid, 'Ms BHAVYA', 'abhishek.2449100@mygyanvihar.com', 'SILS', 'Student', '2449100', 5),
    ('d758a13b-8b8d-5c03-8ff5-57fd14fe833f'::uuid, 'Ms PREKSHA', 'preksha.2347426@mygyanvihar.com', 'SILS', 'Student', '2347426', 7),
    ('512652b5-8e54-53fa-8efa-5d5458895ae9'::uuid, 'Mr AMIT CHAWALA', 'amit.23182830@mygyanvihar.com', 'SILS', 'Student', '23182830', 7),
    ('51ceeed8-8364-5f6c-b565-73d7e48b35c1'::uuid, 'Abhinav Goel', 'abhinav.2547028@mygyanvihar.com', 'C3WR', 'Student', '2547028', 3),
    ('fc0ac81b-3382-53e3-8726-03912bab6bab'::uuid, 'Santanu Sarkar', 'santanu.2547205@mygyanvihar.com', 'C3WR', 'Student', '2547205', 3),
    ('91e39e0a-9af7-55ce-af14-f72e2b8e874a'::uuid, 'Manisha choudhary', 'manisha.2550362@mygyanvihar.com', 'C3WR', 'Student', '2550362', 3),
    ('c12efcb2-68a6-5fc9-8a4c-d97255b591fe'::uuid, 'Harshit Singh', 'harshit.2550366@mygyanvihar.com', 'C3WR', 'Student', '2550366', 3),
    ('19cbdd5f-c60b-53f8-891c-380788243922'::uuid, 'Prasen Kumar Singh', 'prasen.2551118@mygyanvihar.com', 'C3WR', 'Student', '2551118', 3),
    ('81e43f38-ae11-59ec-8fd2-709bac141c51'::uuid, 'Chandrakanta Suman', 'chandrakanta.2550323@mygyanvihar.com', 'C3WR', 'Student', '2550323', 3),
    ('d63abfe5-c910-5645-a29d-c1aede9975c6'::uuid, 'Ninjal', 'ninjal.2549590@mygyanvihar.com', 'Applied Sciences', 'Student', '2549590', 3),
    ('f5752c37-0ec7-5553-962f-1e72c41381c9'::uuid, 'Kanika Gautam', 'kanika.2549940@mygyanvihar.com', 'Applied Sciences', 'Student', '2549940', 3),
    ('705b00c2-c0be-5958-ab98-e8bb9b188921'::uuid, 'Ayasha Yadav', 'ayasha.2550917@mygyanvihar.com', 'Applied Sciences', 'Student', '2550917', 3),
    ('cd59be08-8085-50b6-aa10-9e4551e93a36'::uuid, 'Keshav Gupta', 'keshav.2454525@mygyanvihar.com', 'Applied Sciences', 'Student', '2454525', 5),
    ('6dd1c1eb-7f83-5a02-816f-69ccf8856625'::uuid, 'Vesika Singh', 'vesika.2455064@mygyanvihar.com', 'Applied Sciences', 'Student', '2455064', 5),
    ('93c46cd4-cc4f-5c41-8195-44613ea542f8'::uuid, 'Vaibhav Singh Thakur', 'vaibhav.2455725@mygyanvihar.com', 'Applied Sciences', 'Student', '2455725', 5),
    ('07eea688-d2a1-5146-83b6-01a1ab495fda'::uuid, 'Anshuman Singh', 'anshuman.2549873@mygyanvihar.com', 'Mech Engg', 'Student', '2549873', 3),
    ('2449269d-d3d1-5dbb-bbc6-b0d798add350'::uuid, 'Jalaj Bansal', 'jalaj.2550454@mygyanvihar.com', 'Mech Engg', 'Student', '2550454', 3),
    ('2970ec25-d697-50b9-8915-e558b9e09fb0'::uuid, 'Sunil Kumar', 'sunil.2455672@mygyanvihar.com', 'Mech Engg', 'Student', '2455672', 5),
    ('e55486c1-6a90-5cd2-b01a-f5da03873bde'::uuid, 'Ravi Raj', 'raviraj.2455903@mygyanvihar.com', 'Mech Engg', 'Student', '2455903', 5),
    ('f57adeb1-b780-5627-b9bd-47bcc12f9a16'::uuid, 'Yash Singh', 'yash.23180717@mygyanvihar.com', 'Mech Engg', 'Student', '23180717', 7),
    ('f3ad5956-1757-5c0a-b4b5-de17028dff5e'::uuid, 'Ravi Kumar', 'ravi.2345541@mygyanvihar.com', 'Mech Engg', 'Student', '2345541', 7),
    ('8730d425-91df-5220-b548-bb907dbbc169'::uuid, 'Akansha Choudhary', 'akansha.2548056@mygyanvihar.com', 'BPT', 'Student', '2548056', 3),
    ('7cab5c3e-a8f8-5540-845c-a19c529d6d7f'::uuid, 'Shubham Kumar Nayak', 'shubham.2545066@mygyanvihar.com', 'BPT', 'Student', '2545066', 3),
    ('5f6ae19a-ba3b-5af6-ac4b-c377eebe2e1f'::uuid, 'Parul Kumawat', 'parul.2548732@mygyanvihar.com', 'BPT', 'Student', '2548732', 3),
    ('ebf7ddd7-399c-581a-8bee-d09587c8b090'::uuid, 'Vidit Grover', 'vidit.2550388@mygyanvihar.com', 'BPT', 'Student', '2550388', 3),
    ('76db4fb9-c15f-55e8-a2d7-a7e6581d905f'::uuid, 'Anshu Nandini', 'anshu.2453216@mygyanvihar.com', 'BPT', 'Student', '2453216', 5),
    ('eb5ff1b6-4d70-56c9-9c38-cbdd8a966204'::uuid, 'Prabhat', 'prabhat.2455789@mygyanvihar.com', 'BPT', 'Student', '2455789', 5),
    ('50213186-4c28-50e2-b7d7-36882745ddaa'::uuid, 'Mansi', 'mansi.2455266@mygyanvihar.com', 'BPT', 'Student', '2455266', 5),
    ('289661c5-8be8-5ac4-83d5-717ba31846b2'::uuid, 'Naveen Kumar', 'naveen.2455788@mygyanvihar.com', 'BPT', 'Student', '2455788', 5),
    ('20ed8ffa-d0ec-5232-b614-fec3f5f01729'::uuid, 'Harendra', 'harendra.2455633@mygyanvihar.com', 'BPT', 'Student', '2455633', 5),
    ('514bc8f3-7d52-5bd6-a33e-84e8fae74351'::uuid, 'Bhumi Rathore', 'bhumi.2548545@mygyanvihar.com', 'GCAD', 'Student', '2548545', 3),
    ('2012afcb-2e2e-5198-aad6-f9e37def5645'::uuid, 'Priya', 'priya.2550245@mygyanvihar.com', 'GCAD', 'Student', '2550245', 3),
    ('75863e2e-0a92-5d8a-854d-fc8dd8244b98'::uuid, 'Roop Singh', 'roop.2548471@mygyanvihar.com', 'Civil', 'Student', '2548471', 3),
    ('ff8601a3-19bb-5c8c-824f-53a6c7b0846e'::uuid, 'Somya', 'somya.2547552@mygyanvihar.com', 'Civil', 'Student', '2547552', 3),
    ('a7cd54c8-b792-5ed7-a14e-c2d483c14adc'::uuid, 'Lokesh Kumar', 'lokesh.2549010@mygyanvihar.com', 'Civil', 'Student', '2549010', 5),
    ('a03f74a3-ed11-574b-9bef-3ce9cea956ca'::uuid, 'Gaurav Swami', 'gaurav.2451540@mygyanvihar.com', 'Civil', 'Student', '2451540', 5),
    ('d20dee82-13f1-56a8-b8bc-7e4d19326816'::uuid, 'Naveen Kumar', 'naveen.2453524@mygyanvihar.com', 'Civil', 'Student', '2453524', 5),
    ('47203e7f-d8a5-5948-a040-adfc748c02e1'::uuid, 'Ayush Raj', 'ayush.2456444@mygyanvihar.com', 'Civil', 'Student', '2456444', 7),
    ('3e24a047-788c-59a5-8fe3-e7cabb3a7b39'::uuid, 'Tareem', 'tareem.23181429@mygyanvihar.com', 'Civil', 'Student', '23181429', 7),
    ('f0447e47-e22c-5fcc-b5e1-9a06efe95aa5'::uuid, 'Priyanshi Sharma', 'priyanshi.2548532@mygyanvihar.com', 'Law', 'Student', '2548532', 3),
    ('8de1ce44-d38f-5958-bee8-9eb433bb6731'::uuid, 'Alok Kumar', 'alok.2547955@mygyanvihar.com', 'Law', 'Student', '2547955', 3),
    ('317e929c-b3bb-5fca-bdb1-e4d631f88314'::uuid, 'Fiza Bano', 'fiza.2548686@mygyanvihar.com', 'Law', 'Student', '2548686', 3),
    ('15e19d2a-0270-520d-81a1-cd7637ab1d9a'::uuid, 'Gaurav Sharma', 'gaurav.2547303@mygyanvihar.com', 'Law', 'Student', '2547303', 3),
    ('c56b3c70-bf87-546f-b86a-ba362676dda5'::uuid, 'Keshav Sharma', 'keshav.2548874@mygyanvihar.com', 'Law', 'Student', '2548874', 3),
    ('808ff7fd-b922-5cff-b4c7-42a0af8ad297'::uuid, 'Syed aaquil', 'syed.2455905@mygyanvihar.com', 'Law', 'Student', '2455905', 5),
    ('66c75024-c2a1-5a59-882c-fa6f599b0e7e'::uuid, 'GAURAV SAHA', 'gaurav.2449873@mygyanvihar.com', 'Law', 'Student', '2449873', 5),
    ('4cca75a0-9c2b-5401-a0eb-31fd36768277'::uuid, 'FARMAN KHAN', 'farman.2452992@mygyanvihar.com', 'Law', 'Student', '2452992', 5),
    ('610d9449-d563-56b8-b9fc-81d52774e57f'::uuid, 'SATYAM KUMAR', 'satyam.2455904@mygyanvihar.com', 'Law', 'Student', '2455904', 5),
    ('eccb7417-e122-5c13-8961-a8c033f14f5b'::uuid, 'SHAHIB KHAN', 'shahib.2452993@mygyanvihar.com', 'Law', 'Student', '2452993', 5),
    ('ead751e6-87fe-5027-a1d7-f371aa586a6b'::uuid, 'Dheeraj', 'dheeraj.23181663@mygyanvihar.com', 'Law', 'Student', '23181663', 7),
    ('debad63c-2f34-5930-8601-aaa3994b4c16'::uuid, 'URMILA BAIRWA', 'urmila.23182011@mygyanvihar.com', 'Law', 'Student', '23182011', 7),
    ('9ba36658-c2e6-5271-a1bd-fc2419c1ac37'::uuid, 'TANISHKA SADH', 'tanishka.2346187@mygyanvihar.com', 'Law', 'Student', '2346187', 7),
    ('160e1244-9baf-5168-ad5f-0720c29a25bb'::uuid, 'SUSHMA BHARTI', 'sushma.23183202@mygyanvihar.com', 'Law', 'Student', '23183202', 7),
    ('4e02eb2a-bb1c-5fd7-ac00-f31f489e66ea'::uuid, 'LALIT BANSIWAL', 'lalit.23181837@mygyanvihar.com', 'Law', 'Student', '23181837', 7),
    ('f95477c9-0fdf-5068-ac1c-b5ca70ca52e5'::uuid, 'Ms.Urvashi Meena', 'urvashi.2549847@mygyanvihar.com', 'Education', 'Student', '2549847', 3),
    ('3a9ded23-ee40-5a88-ada3-676b9c427c13'::uuid, 'Anushka kumari mahawar', 'anushka.2549868@mygyanvihar.com', 'Education', 'Student', '2549868', 3),
    ('dfe54260-3452-59f7-b7f9-d9022db99251'::uuid, 'Rajeshwari Gurjar', 'rajeshwari.2550093@mygyanvihar.com', 'Education', 'Student', '2550093', 3),
    ('502e9e12-1eb8-5b39-b168-333d5302e29e'::uuid, 'Payal Meena', 'payal.2550549@mygyanvihar.com', 'Education', 'Student', '2550549', 3),
    ('48acb644-693d-5da8-a930-91aacb36ffa1'::uuid, 'Diya Mehra', 'diya.2549828@mygyanvihar.com', 'Education', 'Student', '2549828', 3),
    ('7074d911-6a3b-54fe-a2db-2c77554a02c6'::uuid, 'Ajay raj singh', 'ajay.2452986@mygyanvihar.com', 'Education', 'Student', '2452986', 5),
    ('7daafec3-1d00-5125-9450-081c261e62d3'::uuid, 'Ansh Akhilesh meena', 'ansh.2452910@mygyanvihar.com', 'Education', 'Student', '2452910', 5),
    ('c0ccd974-81c1-5a84-b59b-4bff150c60e9'::uuid, 'Ansh pratap singh', 'ansh.2452976@mygyanvihar.com', 'Education', 'Student', '2452976', 5),
    ('93d04db9-2ed9-584f-b789-fe5cbe0ae892'::uuid, 'Ashish aaloriya', 'ashish.2453244@mygyanvihar.com', 'Education', 'Student', '2453244', 5),
    ('0ed11759-21ca-51bb-9c9a-0545547d13ac'::uuid, 'Balraj meena', 'balraj.2454139@mygyanvihar.com', 'Education', 'Student', '2454139', 5),
    ('42f3cc2c-2a29-5843-b4c1-b5b9050e1ff9'::uuid, 'Manish', 'manish.23181674@mygyanvihar.com', 'Education', 'Student', '23181674', 7),
    ('c69c4a8b-04df-5be8-9fe7-bceaed9a8042'::uuid, 'surabh', 'surabh.23180554@mygyanvihar.com', 'Education', 'Student', '23180554', 7),
    ('04b1cd46-948c-5109-8a2b-c81a2f82008e'::uuid, 'Sanjeev Meena', 'sanjeev.23181724@mygyanvihar.com', 'Education', 'Student', '23181724', 7),
    ('476688dd-c101-55a3-8405-ff747fe1df98'::uuid, 'Deepak', 'deepak.23180596@mygyanvihar.com', 'Education', 'Student', '23180596', 7),
    ('ee4b6a55-c479-52a6-9d29-cd956d0065c0'::uuid, 'Deepak Tanwar', 'deepak.23181628@mygyanvihar.com', 'Education', 'Student', '23181628', 7),
    ('1fc80bfb-882a-5fc8-8d4e-e1511cf84038'::uuid, 'kasak kanwar', 'kasak.23182369@mygyanvihar.com', 'Agriculture', 'Student', '23182369', NULL),
    ('423e5cbd-9f7b-5efb-9de4-f04a4cddc190'::uuid, 'himanshu mali', 'himanshu.23181124@mygyanvihar.com', 'Agriculture', 'Student', '23181124', NULL),
    ('be301307-784c-5e6b-b23c-0b56ff8ab275'::uuid, 'jay kumar roy', 'jaykumar.23181408@mygyanvihar.com', 'Agriculture', 'Student', '23181408', NULL),
    ('c7945bc6-09c8-53e9-ac97-860658ece187'::uuid, 'tanushree patidar', 'tanushre.23182587@mygyanvihar.com', 'Agriculture', 'Student', '23182587', NULL),
    ('4cc529e6-bea4-5542-a699-856101101d1d'::uuid, 'Sara Jeelani', 'sara.23178477@mygyanvihar.com', 'Agriculture', 'Student', '23178477', NULL),
    ('e0a70a3e-aee5-5774-a2b3-b56a1c97d5ea'::uuid, 'shruti singh', 'shruti.2453893@mygyanvihar.com', 'Agriculture', 'Student', '2453893', NULL),
    ('cf2db38d-47f8-58cd-b272-38fe9bb78a43'::uuid, 'chahat', 'chahat.2454864@mygyanvihar.com', 'Agriculture', 'Student', '2454864', NULL),
    ('7911417d-513d-5296-bf2e-79671b937e7c'::uuid, 'Apurva vaishnavi', 'apurva.2453892@mygyanvihar.com', 'Agriculture', 'Student', '2453892', NULL),
    ('c48509ce-d0c3-57a8-8398-967a90ccc7ad'::uuid, 'dinesh choudhary', 'dinesh.2455330@mygyanvihar.com', 'Agriculture', 'Student', '2455330', NULL),
    ('beaf8a42-531e-5b11-80ae-dd9222c6f75d'::uuid, 'divyakumar', 'divya.2454465@mygyanvihar.com', 'Agriculture', 'Student', '2454465', NULL),
    ('68799ab1-38ad-5293-a685-2cb7d01e10f1'::uuid, 'Ashish kumar', 'ashish.2551126@mygyanvihar.com', 'Agriculture', 'Student', '2551126', 3),
    ('498f66ab-47c7-504c-a6ba-720e1a962ec5'::uuid, 'ashish sharma', 'ashish.2550342@mygyanvihar.com', 'Agriculture', 'Student', '2550342', 3),
    ('3f186218-2c6a-5daf-bad0-81ece36a8a07'::uuid, 'ayush meena', 'ayush.2552687@mygyanvihar.com', 'Agriculture', 'Student', '2552687', 3)
  ) AS s(user_id, name, email, dept_name, role_name, enrollment_no, semester_num)
)
INSERT INTO student_profiles (
  tenant_id, user_id, enrollment_no, enrollment_number, admission_number,
  batch, nationality, admission_status, status
)
SELECT
  u.tenant_id, u.user_id, s.enrollment_no, s.enrollment_no, s.enrollment_no,
  d.dept_name, 'Indian', 'ACTIVE', 'ACTIVE'
FROM seed_students s
JOIN users u ON u.user_id = s.user_id
JOIN departments d ON d.dept_name = s.dept_name
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  enrollment_no = EXCLUDED.enrollment_no,
  enrollment_number = EXCLUDED.enrollment_number,
  admission_number = EXCLUDED.admission_number,
  batch = EXCLUDED.batch,
  updated_at = NOW();
