-- Google Workspace uses @mygyanvihar.com; allow alongside .org
UPDATE public.tenants
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{allowed_email_domains}',
  '["mygyanvihar.org", "mygyanvihar.com"]'::jsonb,
  true
),
updated_at = NOW()
WHERE subdomain = 'sgvu';
