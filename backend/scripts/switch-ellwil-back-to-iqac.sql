-- After AI upload testing: restore ellwil@mygyanvihar.com to IQAC admin dashboard.
-- Requires role 'IQAC' to exist (role_id 1 in typical seed).

UPDATE users
SET role_id = (SELECT role_id FROM roles WHERE role_name = 'IQAC' LIMIT 1)
WHERE LOWER(official_email) = LOWER('ellwil@mygyanvihar.com');

-- Optional: inspect
-- SELECT u.official_email, r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE LOWER(u.official_email) = LOWER('ellwil@mygyanvihar.com');
