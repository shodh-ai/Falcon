-- Track 4: Tokamak Challenges / Gladiator competitions

CREATE TABLE IF NOT EXISTS competitions (
  competition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  slug VARCHAR(80) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('DRAFT','OPEN','LOCKDOWN','CLOSED')),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS competition_rounds (
  round_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(competition_id) ON DELETE CASCADE,
  stage VARCHAR(32) NOT NULL
    CHECK (stage IN ('WHITEPAPER','TOP20_LOCKDOWN','GOLDEN_TICKET')),
  opens_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at TIMESTAMPTZ,
  capacity INT
);

CREATE TABLE IF NOT EXISTS competition_entries (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(competition_id) ON DELETE CASCADE,
  round_id UUID REFERENCES competition_rounds(round_id) ON DELETE SET NULL,
  applicant_user_id UUID REFERENCES users(user_id),
  applicant_email TEXT,
  applicant_name TEXT,
  whitepaper_url TEXT,
  score NUMERIC(8,2),
  stage VARCHAR(32) NOT NULL DEFAULT 'WHITEPAPER',
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED','SHORTLISTED','WINNER','REJECTED')),
  golden_ticket_code VARCHAR(40),
  admissions_lead_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokamak_network_channels (
  channel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS tokamak_network_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES tokamak_network_channels(channel_id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(user_id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokamak_network_members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id),
  email TEXT,
  competition_entry_id UUID REFERENCES competition_entries(entry_id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bounty_tasks (
  bounty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reward_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','CLAIMED','PAID','CLOSED')),
  claimed_by UUID REFERENCES users(user_id),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  tid UUID;
  c1 UUID; c2 UUID; c3 UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN SELECT tenant_id INTO tid FROM tenants LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;

  INSERT INTO competitions (tenant_id, slug, title, description, status) VALUES
    (tid, 'sim-to-real-rodeo', 'Sim-to-Real Rodeo', 'Brutal hardware balancing hackathon', 'OPEN'),
    (tid, 'laser-strike-target-lock', 'Laser Strike Target Lock', 'Optical tracking gladiator event', 'OPEN'),
    (tid, 'junk-physics', 'Junk Physics', 'Build instruments from scrap physics', 'OPEN')
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  SELECT competition_id INTO c1 FROM competitions WHERE tenant_id = tid AND slug = 'sim-to-real-rodeo';
  SELECT competition_id INTO c2 FROM competitions WHERE tenant_id = tid AND slug = 'laser-strike-target-lock';
  SELECT competition_id INTO c3 FROM competitions WHERE tenant_id = tid AND slug = 'junk-physics';

  IF c1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM competition_rounds WHERE competition_id = c1) THEN
    INSERT INTO competition_rounds (competition_id, stage, capacity) VALUES
      (c1, 'WHITEPAPER', 1000), (c1, 'TOP20_LOCKDOWN', 20), (c1, 'GOLDEN_TICKET', 5),
      (c2, 'WHITEPAPER', 1000), (c2, 'TOP20_LOCKDOWN', 20), (c2, 'GOLDEN_TICKET', 5),
      (c3, 'WHITEPAPER', 1000), (c3, 'TOP20_LOCKDOWN', 20), (c3, 'GOLDEN_TICKET', 5);
  END IF;

  INSERT INTO tokamak_network_channels (tenant_id, name, description)
  SELECT tid, 'General', 'Top-1000 applicant warm network'
  WHERE NOT EXISTS (SELECT 1 FROM tokamak_network_channels WHERE tenant_id = tid AND name = 'General');

  INSERT INTO bounty_tasks (tenant_id, title, description, reward_inr, status)
  SELECT tid, 'Shodh CAD Sprint', 'Submit a CAD assembly for optical mount', 5000, 'OPEN'
  WHERE NOT EXISTS (SELECT 1 FROM bounty_tasks WHERE tenant_id = tid AND title = 'Shodh CAD Sprint');
END $$;
