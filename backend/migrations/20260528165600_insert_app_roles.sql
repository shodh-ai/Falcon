INSERT INTO roles (role_name, description)
VALUES
  ('Accountant', 'Application role for Accountant portal access'),
  ('AdmissionsOfficer', 'Application role for AdmissionsOfficer portal access'),
  ('Dean', 'Application role for Dean portal access'),
  ('Faculty', 'Application role for Faculty portal access'),
  ('HOD', 'Application role for HOD portal access'),
  ('HR', 'Application role for HR portal access'),
  ('IQAC', 'Application role for IQAC portal access'),
  ('Librarian', 'Application role for Librarian portal access'),
  ('PlacementCell', 'Application role for PlacementCell portal access'),
  ('President', 'Application role for President portal access'),
  ('Registrar', 'Application role for Registrar portal access'),
  ('SuperAdmin', 'Application role for SuperAdmin portal access'),
  ('TransportOfficer', 'Application role for TransportOfficer portal access'),
  ('Warden', 'Application role for Warden portal access'),
  ('Chairman', 'Executive read-only analytics for Chairman and Directors')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;
