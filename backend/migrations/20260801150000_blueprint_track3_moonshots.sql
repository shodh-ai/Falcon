-- Track 3: Deep-Tech Moonshots

CREATE TABLE IF NOT EXISTS moonshot_programs (
  program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  domain_tags TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS moonshot_projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES moonshot_programs(program_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  student_user_id UUID NOT NULL REFERENCES users(user_id),
  guide_user_id UUID REFERENCES users(user_id),
  wrangler_user_id UUID REFERENCES users(user_id),
  lab_admin_user_id UUID REFERENCES users(user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'IDEATION'
    CHECK (status IN ('IDEATION','ACTIVE','DISCLOSURE','IP_LINKED','ARCHIVED')),
  disclosure_notes TEXT,
  ip_agreement_id UUID,
  academic_rnd_application_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE tid UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN SELECT tenant_id INTO tid FROM tenants LIMIT 1; END IF;
  IF tid IS NULL THEN RETURN; END IF;

  INSERT INTO moonshot_programs (tenant_id, code, name, description, domain_tags) VALUES
    (tid, 'PROG_MATTER', 'Programmable Matter',
     'Liquid Metal (EGaIn) antennas, 4D printed metamaterials, thermal logic gates',
     ARRAY['egaIn','4d-print','thermal-logic']),
    (tid, 'QUANTUM_PHOTONICS', 'Applied Quantum & Photonics',
     'FSOC, desktop QKD, physical reservoir computing',
     ARRAY['fsoc','qkd','reservoir']),
    (tid, 'AI_MICROFLUIDICS', 'AI-Driven Microfluidics',
     'Lab-on-a-chip, sonochemical synthesis, fluidic memristors',
     ARRAY['loc','sono','memristor']),
    (tid, 'EXTREME_MECHATRONICS', 'Extreme Mechatronics',
     'Mid-air laser forging, Sim-to-Real BLDC/FOC balancing',
     ARRAY['levitation','sim2real','foc']),
    (tid, 'BIO_COMPUTE', 'Bio-Compute & Advanced Energy',
     'Graphene biosensors, phytosensors, betavoltaics, desktop fusors',
     ARRAY['biosensor','betavoltaic','fusor'])
  ON CONFLICT (tenant_id, code) DO NOTHING;
END $$;
