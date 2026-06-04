-- Demo hostel rooms + beds for Tatkal testing
INSERT INTO operations_hostel_rooms (hostel_block, room_number, capacity, occupied, gender, status)
SELECT v.block, v.room, v.cap, 0, 'BOYS', 'AVAILABLE'
FROM (VALUES
  ('Block A', '101', 3),
  ('Block A', '102', 3),
  ('Block B', '201', 2)
) AS v(block, room, cap)
WHERE NOT EXISTS (SELECT 1 FROM operations_hostel_rooms LIMIT 1);

INSERT INTO hostel_beds (tenant_id, room_id, bed_number, is_premium)
SELECT t.tenant_id, r.room_id, 'B' || gs.n, (gs.n = 1)
FROM operations_hostel_rooms r
CROSS JOIN generate_series(1, GREATEST(r.capacity, 1)) AS gs(n)
CROSS JOIN (SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1) t
WHERE NOT EXISTS (SELECT 1 FROM hostel_beds LIMIT 1);
