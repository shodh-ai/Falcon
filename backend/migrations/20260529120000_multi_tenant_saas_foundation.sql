-- Multi-tenant SaaS foundation: public registry + schema-per-tenant support
-- Run: psql -d university_governance -f backend/migrations/20260529120000_multi_tenant_saas_foundation.sql

-- ---------------------------------------------------------------------------
-- 1. Tenant registry (public schema — shared across all universities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  tenant_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  subdomain       VARCHAR(63) NOT NULL UNIQUE,
  custom_domain   VARCHAR(255) UNIQUE,
  pg_schema       VARCHAR(63) NOT NULL,
  primary_color   VARCHAR(7) NOT NULL DEFAULT '#08234a',
  accent_color    VARCHAR(7) NOT NULL DEFAULT '#d6b65d',
  logo_url        VARCHAR(512),
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  feature_key     VARCHAR(64) NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON public.tenant_subscriptions(tenant_id);

-- ---------------------------------------------------------------------------
-- 2. Seed SGVU (existing data stays in public schema; new tenants get own schema)
-- ---------------------------------------------------------------------------
INSERT INTO public.tenants (
  tenant_id,
  name,
  subdomain,
  custom_domain,
  pg_schema,
  primary_color,
  accent_color,
  settings
) VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Suresh Gyan Vihar University',
  'sgvu',
  NULL,
  'public',
  '#08234a',
  '#d6b65d',
  jsonb_build_object(
    'min_attendance_percent', 75,
    'allowed_email_domains', jsonb_build_array('mygyanvihar.org', 'mygyanvihar.com'),
    'cgpa_formula', 'standard_10_point'
  )
) ON CONFLICT (subdomain) DO UPDATE SET
  name = EXCLUDED.name,
  settings = EXCLUDED.settings,
  updated_at = NOW();

-- Enable all modules for SGVU (demo / launch tenant)
INSERT INTO public.tenant_subscriptions (tenant_id, feature_key, is_enabled)
SELECT 'a0000000-0000-4000-8000-000000000001', f.key, TRUE
FROM (VALUES
  ('transport'), ('hostel'), ('exams'), ('helpdesk'),
  ('ai_document_verification'), ('mentorship'), ('iqac'), ('hr'),
  ('analytics_premium')
) AS f(key)
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Row-level tenant_id on users (defense-in-depth; extend to other tables over time)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE users
SET tenant_id = 'a0000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

ALTER TABLE users
  ALTER COLUMN tenant_id SET DEFAULT 'a0000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_tenant'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_tenant
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- Drop global unique email; emails are unique per tenant
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_official_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email
  ON users(tenant_id, official_email);

-- ---------------------------------------------------------------------------
-- 4. Dedicated schema template for new universities (example: demo tenant)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tenant_demo;

COMMENT ON SCHEMA tenant_demo IS 'Template schema for new SaaS tenants; clone structure from public when onboarding.';
