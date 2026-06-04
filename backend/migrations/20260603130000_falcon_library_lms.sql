-- Falcon Library Management System (Koha replacement)

CREATE TABLE IF NOT EXISTS lib_catalog (
  catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  isbn VARCHAR(20),
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  publisher VARCHAR(255),
  edition VARCHAR(50),
  category VARCHAR(100),
  synopsis TEXT,
  cover_image_url TEXT,
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, isbn)
);

CREATE INDEX IF NOT EXISTS idx_lib_catalog_tenant ON lib_catalog(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lib_catalog_isbn ON lib_catalog(isbn);
CREATE INDEX IF NOT EXISTS idx_lib_catalog_title ON lib_catalog(title);
CREATE INDEX IF NOT EXISTS idx_lib_catalog_author ON lib_catalog(author);
CREATE INDEX IF NOT EXISTS idx_lib_catalog_fts ON lib_catalog USING GIN(search_vector);

CREATE OR REPLACE FUNCTION lib_catalog_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.author, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.publisher, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.isbn, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lib_catalog_search_vector ON lib_catalog;
CREATE TRIGGER trg_lib_catalog_search_vector
  BEFORE INSERT OR UPDATE ON lib_catalog
  FOR EACH ROW EXECUTE FUNCTION lib_catalog_search_vector_update();

CREATE TABLE IF NOT EXISTS lib_inventory_copies (
  copy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES lib_catalog(catalog_id) ON DELETE CASCADE,
  accession_number VARCHAR(50) NOT NULL,
  shelf_location VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, accession_number)
);

CREATE INDEX IF NOT EXISTS idx_lib_copies_catalog ON lib_inventory_copies(catalog_id, status);
CREATE INDEX IF NOT EXISTS idx_lib_copies_accession ON lib_inventory_copies(accession_number);

CREATE TABLE IF NOT EXISTS lib_circulation (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  copy_id UUID NOT NULL REFERENCES lib_inventory_copies(copy_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ,
  renewed_count INT NOT NULL DEFAULT 0,
  fine_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  fine_pushed_to_finance BOOLEAN NOT NULL DEFAULT false,
  fee_demand_id UUID REFERENCES finance_fee_demands(demand_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lib_circulation_active
  ON lib_circulation(user_id, returned_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lib_circulation_overdue
  ON lib_circulation(due_date) WHERE returned_at IS NULL;

CREATE TABLE IF NOT EXISTS lib_reservations (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES lib_catalog(catalog_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  queue_position INT NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'WAITING',
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, catalog_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lib_reservations_catalog
  ON lib_reservations(catalog_id, status, queue_position);

CREATE TABLE IF NOT EXISTS lib_digital_resources (
  resource_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  resource_type VARCHAR(40) NOT NULL DEFAULT 'PDF',
  category VARCHAR(100),
  file_url TEXT,
  external_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lib_gate_visits (
  visit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lib_gate_open ON lib_gate_visits(tenant_id, user_id) WHERE exited_at IS NULL;
