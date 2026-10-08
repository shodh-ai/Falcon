-- Production seed: Blueprint personas (password: password123)
-- COO, EstateOfficer, LabAdmin, CompetitionAdmin, FellowshipAdmin, Wrangler

WITH tenant AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
pwd AS (
  SELECT '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO'::varchar AS hash
),
persona AS (
  SELECT * FROM (VALUES
    ('COO', 'Wartime COO', 'coo@mygyanvihar.com', 'b00000c0-0000-4000-8000-0000000000c0'::uuid),
    ('EstateOfficer', 'Estate Officer', 'estate@mygyanvihar.com', 'b00000e0-0000-4000-8000-0000000000e0'::uuid),
    ('LabAdmin', 'Tokamak Lab Admin', 'labadmin@mygyanvihar.com', 'b000001a-0000-4000-8000-00000000001a'::uuid),
    ('CompetitionAdmin', 'Competition Admin', 'challenges@mygyanvihar.com', 'b00000ca-0000-4000-8000-0000000000ca'::uuid),
    ('FellowshipAdmin', 'Fellowship Admin', 'fellowship@mygyanvihar.com', 'b00000f0-0000-4000-8000-0000000000f0'::uuid),
    ('Wrangler', 'Industry Wrangler', 'wrangler@mygyanvihar.com', 'b00000d0-0000-4000-8000-0000000000d0'::uuid),
    ('PoP', 'Professor of Practice', 'pop@mygyanvihar.com', 'b00000a0-0000-4000-8000-0000000000a0'::uuid)
  ) AS v(role_name, display_name, email, user_id)
)
INSERT INTO users (
  user_id, tenant_id, name, official_email, role_id,
  password_hash, salary_base, onboarding_status, is_active
)
SELECT
  p.user_id,
  t.tenant_id,
  p.display_name,
  p.email,
  r.role_id,
  pwd.hash,
  90000.00,
  'ACTIVE',
  true
FROM persona p
CROSS JOIN tenant t
CROSS JOIN pwd
JOIN roles r ON r.role_name = p.role_name
ON CONFLICT (tenant_id, official_email) DO UPDATE SET
  name = EXCLUDED.name,
  role_id = EXCLUDED.role_id,
  password_hash = EXCLUDED.password_hash,
  onboarding_status = 'ACTIVE',
  is_active = true;

INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.user_id, u.role_id, true
FROM users u
JOIN public.tenants t ON t.tenant_id = u.tenant_id AND t.subdomain = 'sgvu'
WHERE lower(u.official_email) IN (
  'coo@mygyanvihar.com',
  'estate@mygyanvihar.com',
  'labadmin@mygyanvihar.com',
  'challenges@mygyanvihar.com',
  'fellowship@mygyanvihar.com',
  'wrangler@mygyanvihar.com',
  'pop@mygyanvihar.com'
)
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Tag wrangler mentor profile
INSERT INTO ecell_mentor_profiles (
  tenant_id, user_id, mentor_tier, org, is_industry_lead, expertise_label, github_focus
)
SELECT t.tenant_id, u.user_id, 'WRANGLER', 'Shodh AI', true, 'GitHub / CAD / Agile sprints', true
FROM public.tenants t
JOIN users u ON u.tenant_id = t.tenant_id AND lower(u.official_email) = 'wrangler@mygyanvihar.com'
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  mentor_tier = 'WRANGLER',
  is_industry_lead = true,
  expertise_label = EXCLUDED.expertise_label;

-- PoP profile
INSERT INTO pop_profiles (tenant_id, user_id, title, bio, equity_incentive_pct, is_active)
SELECT t.tenant_id, u.user_id, 'Professor of Practice — Deep Tech',
       'Ex-founder / industry practice faculty', 1.5, true
FROM public.tenants t
JOIN users u ON u.tenant_id = t.tenant_id AND lower(u.official_email) = 'pop@mygyanvihar.com'
WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  title = EXCLUDED.title,
  equity_incentive_pct = EXCLUDED.equity_incentive_pct,
  is_active = true;
