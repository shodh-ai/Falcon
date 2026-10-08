-- Architect Blueprint Wave 0: new operational / deep-tech roles
INSERT INTO roles (role_name, description)
VALUES
  ('COO', 'Wartime COO — operational isolation from Chairman/VC'),
  ('EstateOfficer', 'Estate / facilities ESM queue owner'),
  ('LabAdmin', 'Tokamak Labs zone and equipment administrator'),
  ('Wrangler', 'Industry drill-sergeant mentor for founder sprints'),
  ('CompetitionAdmin', 'Tokamak Challenges / Gladiator competitions admin'),
  ('PoP', 'Professor of Practice — founder/industry faculty track'),
  ('FellowshipAdmin', 'Hacker Filter fellowship trial administrator')
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;
