-- Transport Hub: routes, zone-based stops, student allocations, dynamic pass tokens

CREATE TABLE IF NOT EXISTS transport_routes (
  route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  route_name VARCHAR(100) NOT NULL,
  vehicle_id UUID REFERENCES fleet_vehicles(vehicle_id) ON DELETE SET NULL,
  driver_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  total_seats INT NOT NULL DEFAULT 40,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_routes_tenant ON transport_routes(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS transport_stops (
  stop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES transport_routes(route_id) ON DELETE CASCADE,
  stop_name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  pickup_time TIME NOT NULL,
  fee_amount DECIMAL(10, 2) NOT NULL,
  stop_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_stops_route ON transport_stops(route_id, stop_order);

CREATE TABLE IF NOT EXISTS transport_allocations (
  allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES transport_routes(route_id),
  stop_id UUID NOT NULL REFERENCES transport_stops(stop_id),
  fee_demand_id UUID REFERENCES finance_fee_demands(demand_id) ON DELETE SET NULL,
  academic_year VARCHAR(10) NOT NULL DEFAULT '2026-27',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  pass_status VARCHAR(50) NOT NULL DEFAULT 'INACTIVE',
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_allocations_route ON transport_allocations(route_id, payment_status);

CREATE TABLE IF NOT EXISTS transport_pass_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  allocation_id UUID NOT NULL REFERENCES transport_allocations(allocation_id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_pass_tokens_lookup
  ON transport_pass_tokens(tenant_id, student_user_id, token_hash, expires_at DESC);
