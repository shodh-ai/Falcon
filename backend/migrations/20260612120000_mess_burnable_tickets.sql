-- Burnable ticket columns for a-la-carte add-on orders
ALTER TABLE mess_addon_orders ADD COLUMN IF NOT EXISTS claim_pin VARCHAR(10);
ALTER TABLE mess_addon_orders ADD COLUMN IF NOT EXISTS static_qr_data TEXT;
ALTER TABLE mess_addon_orders ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mess_addon_orders_claim_pin
  ON mess_addon_orders (claim_pin) WHERE claim_pin IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mess_addon_orders_static_qr
  ON mess_addon_orders (static_qr_data) WHERE static_qr_data IS NOT NULL;

-- Master meal pass entry log (buffet identity check — separate from add-on tickets)
CREATE TABLE IF NOT EXISTS mess_meal_entries (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  meal_type VARCHAR(20) NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_user_id, meal_type, entry_date)
);

-- Backfill unredeemed orders with burnable tickets
DO $$
DECLARE
  r RECORD;
  pin TEXT;
  tries INT;
BEGIN
  FOR r IN
    SELECT order_id FROM mess_addon_orders
    WHERE claim_pin IS NULL OR static_qr_data IS NULL
  LOOP
    tries := 0;
    LOOP
      pin := lpad((floor(random() * 9000 + 1000))::int::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM mess_addon_orders WHERE claim_pin = pin);
      tries := tries + 1;
      EXIT WHEN tries > 20;
    END LOOP;
    UPDATE mess_addon_orders
    SET claim_pin = pin,
        static_qr_data = 'FALCON:ORDER:' || r.order_id::text
    WHERE order_id = r.order_id
      AND (claim_pin IS NULL OR static_qr_data IS NULL);
  END LOOP;
END $$;
