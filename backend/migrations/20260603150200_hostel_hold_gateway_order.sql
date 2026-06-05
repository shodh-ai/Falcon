ALTER TABLE hostel_booking_holds
  ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(120);
