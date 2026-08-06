-- Track 2: Tokamak Labs

CREATE TABLE IF NOT EXISTS lab_zones (
  zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  zone_code VARCHAR(32) NOT NULL
    CHECK (zone_code IN ('ZONE1_OPTICAL','ZONE2_FAB','ZONE3_SUBTRACTIVE','ZONE4_EDGE')),
  name TEXT NOT NULL,
  description TEXT,
  venue_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, zone_code)
);

CREATE TABLE IF NOT EXISTS lab_equipment (
  equipment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES lab_zones(zone_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_tag VARCHAR(64),
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','CHECKED_OUT','MAINTENANCE')),
  requires_safety_training BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS lab_equipment_checkouts (
  checkout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES lab_equipment(equipment_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id),
  checked_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  safety_ack BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS lab_partner_orgs (
  partner_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  partner_code VARCHAR(40) NOT NULL,
  contact_email TEXT,
  specialty TEXT,
  UNIQUE (tenant_id, partner_code)
);

CREATE TABLE IF NOT EXISTS lab_partner_work_orders (
  work_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES lab_partner_orgs(partner_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','IN_PROGRESS','DONE','CANCELLED')),
  requested_by UUID REFERENCES users(user_id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  tid UUID;
  z1 UUID; z2 UUID; z3 UUID; z4 UUID;
  dept_budget UUID;
BEGIN
  SELECT tenant_id INTO tid FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF tid IS NULL THEN
    SELECT tenant_id INTO tid FROM tenants LIMIT 1;
  END IF;
  IF tid IS NULL THEN RETURN; END IF;

  INSERT INTO lab_zones (tenant_id, zone_code, name, description)
  VALUES
    (tid, 'ZONE1_OPTICAL', 'Optical & Acoustic Bench', 'M6 breadboards, scopes, SPAD, NanoVNA'),
    (tid, 'ZONE2_FAB', 'Rapid Fab & Chemistry', 'FDM/SLA, reflow, fume hoods'),
    (tid, 'ZONE3_SUBTRACTIVE', 'Subtractive & Assembly', 'CNC, LumenPnP, micro-soldering'),
    (tid, 'ZONE4_EDGE', 'Edge Compute / AI Brain', 'RTX racks, Orange Pi, Jetson')
  ON CONFLICT (tenant_id, zone_code) DO NOTHING;

  SELECT zone_id INTO z1 FROM lab_zones WHERE tenant_id = tid AND zone_code = 'ZONE1_OPTICAL';
  SELECT zone_id INTO z2 FROM lab_zones WHERE tenant_id = tid AND zone_code = 'ZONE2_FAB';
  SELECT zone_id INTO z3 FROM lab_zones WHERE tenant_id = tid AND zone_code = 'ZONE3_SUBTRACTIVE';
  SELECT zone_id INTO z4 FROM lab_zones WHERE tenant_id = tid AND zone_code = 'ZONE4_EDGE';

  IF z1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lab_equipment WHERE tenant_id = tid LIMIT 1) THEN
    INSERT INTO lab_equipment (tenant_id, zone_id, name, asset_tag, specs, requires_safety_training) VALUES
      (tid, z1, 'M6 Optical Breadboard', 'OPT-001', '{"threads":"M6"}'::jsonb, false),
      (tid, z1, '100MHz Oscilloscope', 'OPT-002', '{"bw":"100MHz"}'::jsonb, false),
      (tid, z2, 'Bambu Lab Carbon FDM', 'FAB-001', '{"type":"FDM"}'::jsonb, true),
      (tid, z2, 'SLA Resin Printer', 'FAB-002', '{"type":"SLA"}'::jsonb, true),
      (tid, z3, 'Bantam Desktop CNC', 'CNC-001', '{"make":"Bantam"}'::jsonb, true),
      (tid, z3, 'LumenPnP', 'ASM-001', '{"type":"PnP"}'::jsonb, true),
      (tid, z4, 'Dual RTX 4090 Rack', 'GPU-001', '{"gpus":2}'::jsonb, true),
      (tid, z4, 'Jetson Orin Kit', 'GPU-002', '{"board":"Orin"}'::jsonb, false);
  END IF;

  INSERT INTO lab_partner_orgs (tenant_id, name, partner_code, specialty)
  VALUES
    (tid, 'I-STEM', 'ISTEM', 'Scale-up & shared instrumentation'),
    (tid, 'CEERI Pilani', 'CEERI', 'Microelectronics / microscopic testing'),
    (tid, 'MNIT', 'MNIT', 'Advanced materials characterization')
  ON CONFLICT (tenant_id, partner_code) DO NOTHING;

  SELECT budget_id INTO dept_budget
  FROM fin_dept_budgets
  WHERE tenant_id = tid AND deleted_at IS NULL
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF dept_budget IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fin_program_budgets
    WHERE tenant_id = tid AND program_name = 'TOKAMAK_RND' AND deleted_at IS NULL
  ) THEN
    INSERT INTO fin_program_budgets (tenant_id, budget_id, program_name, program_type, allocated_amount, status)
    VALUES (tid, dept_budget, 'TOKAMAK_RND', 'RND', 200000, 'ACTIVE');
  END IF;
END $$;
