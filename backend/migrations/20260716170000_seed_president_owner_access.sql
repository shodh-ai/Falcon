-- Grant Owner / Executive Board access to President (VC) personas for leadership APIs.
-- OwnerAccessGuard previously only seeded Chairman, causing 403 on /api/leadership/* for President.

WITH t AS (
  SELECT tenant_id FROM public.tenants WHERE subdomain = 'sgvu' LIMIT 1
),
presidents AS (
  SELECT u.user_id, u.tenant_id
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE lower(r.role_name) IN ('president', 'vice chancellor')
    AND u.is_active = true
  UNION
  SELECT u.user_id, u.tenant_id
  FROM users u
  WHERE lower(u.official_email) IN (
    'president@mygyanvihar.com',
    'dev.president@mygyanvihar.com'
  )
)
INSERT INTO owner_access_control (tenant_id, user_id, role_label, is_active)
SELECT COALESCE(p.tenant_id, t.tenant_id), p.user_id, 'President', true
FROM presidents p
CROSS JOIN t
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET is_active = true,
    role_label = COALESCE(owner_access_control.role_label, 'President');
