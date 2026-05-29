UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty')
WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty Member');

UPDATE task_master
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty')
WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty Member');

UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Dean')
WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Dean / Principal / Heads');

UPDATE task_master
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Dean')
WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Dean / Principal / Heads');

UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'SuperAdmin')
WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Admin');

UPDATE task_master
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'SuperAdmin')
WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'Admin');

DELETE FROM users
WHERE official_email IN (
  'dev.admin@mygyanvihar.com',
  'dev.facultymember@mygyanvihar.com',
  'dev.deanprincipalheads@mygyanvihar.com'
);

DELETE FROM roles
WHERE role_name IN ('Faculty Member', 'Dean / Principal / Heads', 'Admin');
