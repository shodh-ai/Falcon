UPDATE users
SET role_id = roles.role_id
FROM roles
WHERE users.official_email = 'y.sachin@mygyanvihar.com'
  AND roles.role_name = 'Faculty';
