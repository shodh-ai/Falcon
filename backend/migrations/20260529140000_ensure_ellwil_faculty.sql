-- Ensure ellwil@mygyanvihar.com is Faculty (proctor / teacher portal access)
UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1),
    is_active = true
WHERE lower(official_email) = 'ellwil@mygyanvihar.com';
