-- Demo transport routes, stops (Jaipur zone pricing), and fleet linkage

INSERT INTO transport_routes (tenant_id, route_name, vehicle_id, driver_user_id, total_seats)
SELECT t.tenant_id, 'Route A — Vaishali Nagar', v.vehicle_id, d.user_id, 45
FROM tenants t
CROSS JOIN LATERAL (SELECT vehicle_id FROM fleet_vehicles WHERE tenant_id = t.tenant_id LIMIT 1) v
LEFT JOIN LATERAL (
  SELECT user_id FROM users WHERE lower(official_email) = 'dev.transportofficer@mygyanvihar.com' LIMIT 1
) d ON true
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM transport_routes WHERE route_name LIKE 'Route A%')
ON CONFLICT DO NOTHING;

INSERT INTO transport_routes (tenant_id, route_name, vehicle_id, total_seats)
SELECT t.tenant_id, 'Route B — Mansarovar', v.vehicle_id, 40
FROM tenants t
CROSS JOIN LATERAL (SELECT vehicle_id FROM fleet_vehicles WHERE tenant_id = t.tenant_id LIMIT 1) v
WHERE t.subdomain = 'sgvu'
  AND NOT EXISTS (SELECT 1 FROM transport_routes WHERE route_name LIKE 'Route B%')
ON CONFLICT DO NOTHING;

INSERT INTO transport_stops (tenant_id, route_id, stop_name, latitude, longitude, pickup_time, fee_amount, stop_order)
SELECT r.tenant_id, r.route_id, s.stop_name, s.lat, s.lng, s.pickup::time, s.fee, s.ord
FROM transport_routes r
JOIN (
  VALUES
    ('Route A — Vaishali Nagar', 'Vaishali Nagar Circle', 26.9124, 75.7434, '07:15', 15000, 1),
    ('Route A — Vaishali Nagar', 'Vidhyadhar Nagar', 26.9280, 75.7870, '07:28', 13500, 2),
    ('Route A — Vaishali Nagar', 'Jhotwara', 26.9450, 75.7680, '07:40', 12000, 3),
    ('Route B — Mansarovar', 'Mansarovar Metro', 26.8640, 75.7700, '07:10', 14000, 1),
    ('Route B — Mansarovar', 'Malviya Nagar', 26.8547, 75.8083, '07:25', 12500, 2),
    ('Route B — Mansarovar', 'Sanganer', 26.8130, 75.8030, '07:38', 11000, 3)
) AS s(route_name, stop_name, lat, lng, pickup, fee, ord) ON s.route_name = r.route_name
WHERE NOT EXISTS (SELECT 1 FROM transport_stops LIMIT 1);
