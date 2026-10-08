-- Pre-provisioned DOFA / P2P UAT personas must skip the first-login onboarding wizard.
-- INSERT trigger trg_users_portal_onboarding_defaults rewrites ACTIVE → PENDING_PASSWORD_RESET
-- for Dean/Faculty/HOD; use COMPLETED so login goes straight to workspace.

UPDATE users u
SET onboarding_status = 'COMPLETED',
    updated_at = NOW()
FROM tenants t
WHERE u.tenant_id = t.tenant_id
  AND t.subdomain = 'sgvu'
  AND lower(u.official_email) IN (
    'labadmin@mygyanvihar.com',
    'hod@mygyanvihar.com',
    'procurement@mygyanvihar.com',
    'prochead@mygyanvihar.com',
    'fincontroller@mygyanvihar.com',
    'cfo@mygyanvihar.com',
    'dean.dofa@mygyanvihar.com',
    'dean@mygyanvihar.com',
    'coo@mygyanvihar.com',
    'chairman@mygyanvihar.com',
    'president@mygyanvihar.com',
    'stores@mygyanvihar.com',
    'security@mygyanvihar.com',
    'apmanager@mygyanvihar.com',
    'apclerk@mygyanvihar.com',
    'auditor@mygyanvihar.com',
    'buyer.it@mygyanvihar.com',
    'buyer.facilities@mygyanvihar.com',
    'helpdesk.dispatch@mygyanvihar.com',
    'receiving@mygyanvihar.com',
    'estate@mygyanvihar.com',
    'campusadmin@mygyanvihar.com'
  )
  AND u.onboarding_status IS DISTINCT FROM 'COMPLETED';
