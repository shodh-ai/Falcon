-- Critical Registrar bugfixes:
-- 1) Backfill student_profiles.tenant_id from users
-- 2) Scrub auto-seeded fake Class-3 DSC credentials

UPDATE student_profiles sp
SET tenant_id = u.tenant_id
FROM users u
WHERE sp.user_id = u.user_id
  AND sp.tenant_id IS NULL
  AND u.tenant_id IS NOT NULL;

UPDATE registrar_dsc_credentials
SET status = 'NOT_CONFIGURED',
    certificate_name = 'Awaiting IT Admin DSC configuration',
    certificate_authority = NULL,
    serial_number = NULL,
    valid_from = NULL,
    expiry_date = NULL,
    issued_by = NULL,
    updated_at = NOW()
WHERE (
    certificate_authority = 'e-Mudhra / Capricorn CA'
    AND issued_by = 'Controller of Certifying Authorities (India)'
  )
  OR serial_number LIKE 'A4F9-%';
