INSERT INTO users (name, official_email, role_id, google_id, is_active)
SELECT dev_users.name, dev_users.official_email, roles.role_id, dev_users.google_id, true
FROM (
  VALUES
    ('Dev Accountant', 'dev.accountant@mygyanvihar.com', 'Accountant', 'dev-accountant'),
    ('Dev Admissions Officer', 'dev.admissionsofficer@mygyanvihar.com', 'AdmissionsOfficer', 'dev-admissionsofficer'),
    ('Dev Dean', 'dev.dean@mygyanvihar.com', 'Dean', 'dev-dean'),
    ('Dev Faculty', 'dev.faculty@mygyanvihar.com', 'Faculty', 'dev-faculty'),
    ('Dev HOD', 'dev.hod@mygyanvihar.com', 'HOD', 'dev-hod'),
    ('Dev HR', 'dev.hr@mygyanvihar.com', 'HR', 'dev-hr'),
    ('Dev IQAC', 'dev.iqac@mygyanvihar.com', 'IQAC', 'dev-iqac'),
    ('Dev Librarian', 'dev.librarian@mygyanvihar.com', 'Librarian', 'dev-librarian'),
    ('Dev Placement Cell', 'dev.placementcell@mygyanvihar.com', 'PlacementCell', 'dev-placementcell'),
    ('Dev President', 'dev.president@mygyanvihar.com', 'President', 'dev-president'),
    ('Dev Registrar', 'dev.registrar@mygyanvihar.com', 'Registrar', 'dev-registrar'),
    ('Dev Super Admin', 'dev.superadmin@mygyanvihar.com', 'SuperAdmin', 'dev-superadmin'),
    ('Dev Transport Officer', 'dev.transportofficer@mygyanvihar.com', 'TransportOfficer', 'dev-transportofficer'),
    ('Dev Warden', 'dev.warden@mygyanvihar.com', 'Warden', 'dev-warden')
) AS dev_users(name, official_email, role_name, google_id)
JOIN roles ON roles.role_name = dev_users.role_name
ON CONFLICT (official_email) DO UPDATE
SET name = EXCLUDED.name,
    role_id = EXCLUDED.role_id,
    google_id = EXCLUDED.google_id,
    is_active = true;
