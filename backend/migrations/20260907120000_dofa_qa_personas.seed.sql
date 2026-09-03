-- DoFA Modules 1-9 + X QA/UAT persona seed.
--
-- SECURITY: this file contains known-password test identities. It is excluded
-- from normal migrations and can only be run by the environment-guarded
-- `npm run db:seed:dofa-qa` command. Never run it against production.
-- Idempotent: rerunning resets only qa.dofa.* accounts and their direct grants.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $seed$
DECLARE
  v_tenant UUID;
  v_other_tenant UUID;
  v_dept_a INT;
  v_dept_b INT;
  v_role_id INT;
  v_user_id UUID;
  v RECORD;
  v_capability TEXT;
  v_scope_type TEXT;
  v_scope_reference TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'DoFA QA seed requires the sgvu tenant';
  END IF;

  SELECT dept_id INTO v_dept_a
  FROM departments
  WHERE deleted_at IS NULL
  ORDER BY CASE WHEN lower(dept_name) LIKE '%physics%' THEN 0 ELSE 1 END, dept_id
  LIMIT 1;

  SELECT dept_id INTO v_dept_b
  FROM departments
  WHERE deleted_at IS NULL AND dept_id IS DISTINCT FROM v_dept_a
  ORDER BY dept_id
  LIMIT 1;

  IF v_dept_a IS NULL THEN
    RAISE EXCEPTION 'DoFA QA seed requires at least one active department';
  END IF;
  v_dept_b := COALESCE(v_dept_b, v_dept_a);

  INSERT INTO roles(role_name, description) VALUES
    ('ServiceTechnician', 'DoFA QA internal service technician'),
    ('SanitizationOperator', 'DoFA QA sanitization operator'),
    ('SanitizationVerifier', 'DoFA QA independent sanitization verifier'),
    ('ExternalServiceProvider', 'Case-scoped external service provider'),
    ('TenantAdmin', 'Tenant-scoped administrator')
  ON CONFLICT(role_name) DO NOTHING;

  FOR v IN
    SELECT * FROM jsonb_to_recordset($personas$
    [
      {"code":"P01","email":"qa.dofa.p01.requester.a@mygyanvihar.test","name":"QA DoFA P01 Acquisition Requester A","role":"Faculty","dept":"A","grants":["ACQUISITION_REQUESTER"]},
      {"code":"P02","email":"qa.dofa.p02.requester.b@mygyanvihar.test","name":"QA DoFA P02 Acquisition Requester B","role":"Faculty","dept":"B","grants":["ACQUISITION_REQUESTER"]},
      {"code":"P03","email":"qa.dofa.p03.buyer@mygyanvihar.test","name":"QA DoFA P03 Procurement Buyer","role":"ProcurementBuyer","grants":["ACQUISITION_VENDOR_REVIEW","PROCUREMENT_VIEW","PROCUREMENT_ORDER_ENTRY"]},
      {"code":"P04","email":"qa.dofa.p04.procurement-head@mygyanvihar.test","name":"QA DoFA P04 Procurement Head","role":"ProcurementHead","grants":["ACQUISITION_VENDOR_REVIEW","PROCUREMENT_VIEW","PROCUREMENT_ORDER_ENTRY"]},
      {"code":"P05","email":"qa.dofa.p05.budget@mygyanvihar.test","name":"QA DoFA P05 Budget Officer","role":"FinanceController","grants":["ACQUISITION_BUDGET_OVERSIGHT","PROCUREMENT_VIEW"]},
      {"code":"P06","email":"qa.dofa.p06.invoice-entry@mygyanvihar.test","name":"QA DoFA P06 Invoice Entrant","role":"APClerk","grants":["PROCUREMENT_VIEW","PROCUREMENT_INVOICE_ENTRY","INVOICE_INTEGRITY_VIEW"]},
      {"code":"P07","email":"qa.dofa.p07.invoice-verify@mygyanvihar.test","name":"QA DoFA P07 Invoice Verifier","role":"APManager","grants":["PROCUREMENT_VIEW","PROCUREMENT_INVOICE_VERIFY","INVOICE_INTEGRITY_VIEW","INVOICE_INTEGRITY_INVESTIGATE"]},
      {"code":"P08","email":"qa.dofa.p08.payment@mygyanvihar.test","name":"QA DoFA P08 Payment Poster","role":"CFO","grants":["PROCUREMENT_VIEW","PROCUREMENT_PAYMENT_POST"]},
      {"code":"P09","email":"qa.dofa.p09.hod-a1@mygyanvihar.test","name":"QA DoFA P09 HOD Approver","role":"HOD","dept":"A","grants":["ACQUISITION_REQUESTER"]},
      {"code":"P10","email":"qa.dofa.p10.dean-a@mygyanvihar.test","name":"QA DoFA P10 Dean Approver","role":"Dean","grants":[]},
      {"code":"P11","email":"qa.dofa.p11.executive@mygyanvihar.test","name":"QA DoFA P11 Executive Approver","role":"President","grants":[]},
      {"code":"P12","email":"qa.dofa.p12.receiving@mygyanvihar.test","name":"QA DoFA P12 Receiving Clerk","role":"ReceivingClerk","grants":["PROCUREMENT_VIEW","PROCUREMENT_RECEIPT_ENTRY"]},
      {"code":"P13","email":"qa.dofa.p13.stores@mygyanvihar.test","name":"QA DoFA P13 Stores Operator","role":"Stores","grants":["PROCUREMENT_VIEW","PROCUREMENT_RECEIPT_ENTRY","RETURNS_VIEW","RETURNS_VENDOR_COORDINATE","RETURNS_SHIP"]},
      {"code":"P14","email":"qa.dofa.p14.capturer@mygyanvihar.test","name":"QA DoFA P14 Physical Capturer","role":"ReceivingClerk","grants":["PRODUCT_VERIFICATION_VIEW","PRODUCT_VERIFICATION_CAPTURE"]},
      {"code":"P15","email":"qa.dofa.p15.physical-review@mygyanvihar.test","name":"QA DoFA P15 Physical Reviewer","role":"Stores","grants":["PRODUCT_VERIFICATION_VIEW","PRODUCT_VERIFICATION_REVIEW"]},
      {"code":"P16","email":"qa.dofa.p16.physical-exception@mygyanvihar.test","name":"QA DoFA P16 Physical Exception Approver","role":"ProcurementHead","grants":["PRODUCT_VERIFICATION_VIEW","PRODUCT_VERIFICATION_EXCEPTION_APPROVE"]},
      {"code":"P17","email":"qa.dofa.p17.identity-prepare@mygyanvihar.test","name":"QA DoFA P17 Identity Preparer","role":"Stores","grants":["INVENTORY_VIEW","INVENTORY_IDENTITY_PREPARE"]},
      {"code":"P18","email":"qa.dofa.p18.rfid-encode@mygyanvihar.test","name":"QA DoFA P18 RFID Encoder","role":"Stores","grants":["INVENTORY_VIEW","INVENTORY_RFID_ENCODE","PHYSICAL_IDENTITY_VIEW","PHYSICAL_IDENTITY_PROVISION"]},
      {"code":"P19","email":"qa.dofa.p19.rfid-verify@mygyanvihar.test","name":"QA DoFA P19 RFID Verifier","role":"InventoryVerifier","grants":["INVENTORY_VIEW","INVENTORY_IDENTITY_VERIFY","PHYSICAL_IDENTITY_VIEW","PHYSICAL_IDENTITY_ATTACH_VERIFY"]},
      {"code":"P20","email":"qa.dofa.p20.gate-security@mygyanvihar.test","name":"QA DoFA P20 Gate Security","role":"Security","grants":["PHYSICAL_IDENTITY_VIEW","GATE_ASSET_OBSERVE","GATE_ASSET_REVIEW"]},
      {"code":"P21","email":"qa.dofa.p21.stock-request@mygyanvihar.test","name":"QA DoFA P21 Stock Requester","role":"Faculty","dept":"A","grants":["CONSUMABLES_VIEW","CONSUMABLES_REQUEST","CONSUMABLES_CONSUMPTION_RECORD"]},
      {"code":"P22","email":"qa.dofa.p22.stock-approve@mygyanvihar.test","name":"QA DoFA P22 Stock Approver","role":"Stores","grants":["CONSUMABLES_VIEW","CONSUMABLES_APPROVE"]},
      {"code":"P23","email":"qa.dofa.p23.stock-issue@mygyanvihar.test","name":"QA DoFA P23 Stock Issuer","role":"Stores","grants":["CONSUMABLES_VIEW","CONSUMABLES_ISSUE"]},
      {"code":"P24","email":"qa.dofa.p24.stock-count@mygyanvihar.test","name":"QA DoFA P24 Stock Counter","role":"Stores","grants":["CONSUMABLES_VIEW","CONSUMABLES_COUNT"]},
      {"code":"P25","email":"qa.dofa.p25.count-approve@mygyanvihar.test","name":"QA DoFA P25 Count Approver","role":"ProcurementHead","grants":["CONSUMABLES_VIEW","CONSUMABLES_COUNT_APPROVE"]},
      {"code":"P26","email":"qa.dofa.p26.return-initiate@mygyanvihar.test","name":"QA DoFA P26 Return Initiator","role":"Faculty","dept":"A","grants":["RETURNS_VIEW","RETURNS_INITIATE"]},
      {"code":"P27","email":"qa.dofa.p27.return-eligibility@mygyanvihar.test","name":"QA DoFA P27 Return Eligibility Reviewer","role":"ProcurementHead","grants":["RETURNS_VIEW","RETURNS_ELIGIBILITY_REVIEW"]},
      {"code":"P28","email":"qa.dofa.p28.return-approve@mygyanvihar.test","name":"QA DoFA P28 Return Approver","role":"ProcurementHead","grants":["RETURNS_VIEW","RETURNS_APPROVE","RETURNS_RECONSIDER"]},
      {"code":"P29","email":"qa.dofa.p29.service-report@mygyanvihar.test","name":"QA DoFA P29 Service Reporter","role":"Faculty","dept":"A","grants":["ASSET_SERVICE_VIEW","ASSET_SERVICE_REQUEST"]},
      {"code":"P30","email":"qa.dofa.p30.technician@mygyanvihar.test","name":"QA DoFA P30 Service Technician","role":"ServiceTechnician","grants":["ASSET_SERVICE_VIEW","ASSET_SERVICE_EXECUTE"]},
      {"code":"P31","email":"qa.dofa.p31.service-accept@mygyanvihar.test","name":"QA DoFA P31 Service Acceptor","role":"LabAdmin","dept":"A","grants":["ASSET_SERVICE_VIEW","ASSET_SERVICE_ACCEPT"]},
      {"code":"P32","email":"qa.dofa.p32.retirement-request@mygyanvihar.test","name":"QA DoFA P32 Retirement Requester","role":"Faculty","dept":"A","grants":["ASSET_RETIREMENT_VIEW","ASSET_RETIREMENT_REQUEST"]},
      {"code":"P33","email":"qa.dofa.p33.retirement-assess@mygyanvihar.test","name":"QA DoFA P33 Retirement Assessor","role":"ProcurementHead","grants":["ASSET_RETIREMENT_VIEW","ASSET_RETIREMENT_ASSESS"]},
      {"code":"P34","email":"qa.dofa.p34.sanitize@mygyanvihar.test","name":"QA DoFA P34 Sanitization Operator","role":"SanitizationOperator","grants":["ASSET_RETIREMENT_VIEW","ASSET_SANITIZATION_EXECUTE"]},
      {"code":"P35","email":"qa.dofa.p35.sanitize-verify@mygyanvihar.test","name":"QA DoFA P35 Sanitization Verifier","role":"SanitizationVerifier","grants":["ASSET_RETIREMENT_VIEW","ASSET_SANITIZATION_VERIFY"]},
      {"code":"P36","email":"qa.dofa.p36.bid-admin@mygyanvihar.test","name":"QA DoFA P36 Bid Administrator","role":"ProcurementHead","grants":["ASSET_RETIREMENT_VIEW","ASSET_DISPOSAL_BID_MANAGE"]},
      {"code":"P37","email":"qa.dofa.p37.disposal-award@mygyanvihar.test","name":"QA DoFA P37 Disposal Award Approver","role":"ProcurementHead","grants":["ASSET_RETIREMENT_VIEW","ASSET_DISPOSAL_AWARD"]},
      {"code":"P38","email":"qa.dofa.p38.disposal-execute@mygyanvihar.test","name":"QA DoFA P38 Disposal Executor","role":"Stores","grants":["ASSET_RETIREMENT_VIEW","ASSET_DISPOSAL_EXECUTE"]},
      {"code":"P39","email":"qa.dofa.p39.auditor@mygyanvihar.test","name":"QA DoFA P39 Internal Auditor","role":"InternalAuditor","grants":["ACQUISITION_AUDIT_OVERSIGHT","PROCUREMENT_AUDIT_VIEW","INVOICE_INTEGRITY_AUDIT","PRODUCT_VERIFICATION_AUDIT","INVENTORY_AUDIT","CONSUMABLES_AUDIT","RETURNS_AUDIT","ASSET_SERVICE_AUDIT","ASSET_RETIREMENT_AUDIT","PHYSICAL_IDENTITY_AUDIT","PROCUREMENT_VIEW","INVOICE_INTEGRITY_VIEW","PRODUCT_VERIFICATION_VIEW","INVENTORY_VIEW","CONSUMABLES_VIEW","RETURNS_VIEW","ASSET_SERVICE_VIEW","ASSET_RETIREMENT_VIEW","PHYSICAL_IDENTITY_VIEW"]},
      {"code":"P40","email":"qa.dofa.p40.tenant-admin@mygyanvihar.test","name":"QA DoFA P40 Tenant Admin","role":"TenantAdmin","grants":["INVOICE_INTEGRITY_POLICY_ADMIN","PRODUCT_VERIFICATION_POLICY_ADMIN","INVENTORY_POLICY_ADMIN","CONSUMABLES_POLICY_ADMIN","RETURNS_POLICY_ADMIN","ASSET_SERVICE_POLICY_ADMIN","ASSET_RETIREMENT_POLICY_ADMIN","PHYSICAL_IDENTITY_POLICY_ADMIN"]},
      {"code":"P41","email":"qa.dofa.p41.super-admin@mygyanvihar.test","name":"QA DoFA P41 Super Admin","role":"SuperAdmin","grants":[]},
      {"code":"P42","email":"qa.dofa.p42.external-provider@provider.test","name":"QA DoFA P42 External Provider","role":"ExternalServiceProvider","grants":[]},
      {"code":"P46","email":"qa.dofa.p46.coo@mygyanvihar.test","name":"QA DoFA P46 COO Approver","role":"COO","grants":[]},

      {"code":"C01","email":"qa.dofa.c01.requester-hod@mygyanvihar.test","name":"QA DoFA C01 Requester HOD","role":"HOD","dept":"A","grants":["ACQUISITION_REQUESTER"]},
      {"code":"C02","email":"qa.dofa.c02.buyer-receiver@mygyanvihar.test","name":"QA DoFA C02 Buyer Receiver","role":"ProcurementBuyer","grants":["PROCUREMENT_VIEW","PROCUREMENT_ORDER_ENTRY","PROCUREMENT_RECEIPT_ENTRY"]},
      {"code":"C03","email":"qa.dofa.c03.invoice-entry-verify@mygyanvihar.test","name":"QA DoFA C03 Invoice Entry Verify","role":"APManager","grants":["PROCUREMENT_VIEW","PROCUREMENT_INVOICE_ENTRY","PROCUREMENT_INVOICE_VERIFY"]},
      {"code":"C04","email":"qa.dofa.c04.investigator-certifier@mygyanvihar.test","name":"QA DoFA C04 Investigator Certifier","role":"FinanceController","grants":["INVOICE_INTEGRITY_VIEW","INVOICE_INTEGRITY_INVESTIGATE","INVOICE_INTEGRITY_CERTIFY"]},
      {"code":"C05","email":"qa.dofa.c05.certifier-payment@mygyanvihar.test","name":"QA DoFA C05 Certifier Payment","role":"CFO","grants":["INVOICE_INTEGRITY_VIEW","INVOICE_INTEGRITY_CERTIFY","PROCUREMENT_VIEW","PROCUREMENT_PAYMENT_POST"]},
      {"code":"C06","email":"qa.dofa.c06.capture-review@mygyanvihar.test","name":"QA DoFA C06 Capture Review","role":"ReceivingClerk","grants":["PRODUCT_VERIFICATION_VIEW","PRODUCT_VERIFICATION_CAPTURE","PRODUCT_VERIFICATION_REVIEW"]},
      {"code":"C07","email":"qa.dofa.c07.encode-verify@mygyanvihar.test","name":"QA DoFA C07 Encode Verify","role":"InventoryVerifier","grants":["INVENTORY_VIEW","INVENTORY_RFID_ENCODE","INVENTORY_IDENTITY_VERIFY","PHYSICAL_IDENTITY_VIEW","PHYSICAL_IDENTITY_PROVISION","PHYSICAL_IDENTITY_ATTACH_VERIFY"]},
      {"code":"C08","email":"qa.dofa.c08.stock-request-approve@mygyanvihar.test","name":"QA DoFA C08 Stock Request Approve","role":"Stores","dept":"A","grants":["CONSUMABLES_VIEW","CONSUMABLES_REQUEST","CONSUMABLES_APPROVE"]},
      {"code":"C09","email":"qa.dofa.c09.count-review@mygyanvihar.test","name":"QA DoFA C09 Count Review","role":"Stores","grants":["CONSUMABLES_VIEW","CONSUMABLES_COUNT","CONSUMABLES_COUNT_APPROVE"]},
      {"code":"C10","email":"qa.dofa.c10.return-all@mygyanvihar.test","name":"QA DoFA C10 Return All","role":"ProcurementHead","grants":["RETURNS_VIEW","RETURNS_INITIATE","RETURNS_ELIGIBILITY_REVIEW","RETURNS_APPROVE"]},
      {"code":"C11","email":"qa.dofa.c11.technician-accept@mygyanvihar.test","name":"QA DoFA C11 Technician Accept","role":"ServiceTechnician","grants":["ASSET_SERVICE_VIEW","ASSET_SERVICE_EXECUTE","ASSET_SERVICE_ACCEPT"]},
      {"code":"C12","email":"qa.dofa.c12.sanitize-verify@mygyanvihar.test","name":"QA DoFA C12 Sanitize Verify","role":"SanitizationOperator","grants":["ASSET_RETIREMENT_VIEW","ASSET_SANITIZATION_EXECUTE","ASSET_SANITIZATION_VERIFY"]},
      {"code":"C13","email":"qa.dofa.c13.bid-award@mygyanvihar.test","name":"QA DoFA C13 Bid Award","role":"ProcurementHead","grants":["ASSET_RETIREMENT_VIEW","ASSET_DISPOSAL_BID_MANAGE","ASSET_DISPOSAL_AWARD"]},
      {"code":"C14","email":"qa.dofa.c14.award-handover@mygyanvihar.test","name":"QA DoFA C14 Award Handover","role":"ProcurementHead","grants":["ASSET_RETIREMENT_VIEW","ASSET_DISPOSAL_AWARD","ASSET_DISPOSAL_EXECUTE"]},
      {"code":"C15","email":"qa.dofa.c15.writeoff-finance@mygyanvihar.test","name":"QA DoFA C15 Writeoff Finance","role":"FinanceController","grants":["ASSET_RETIREMENT_VIEW","ASSET_RETIREMENT_DOFA_SUBMIT","ASSET_RETIREMENT_RECONCILE"]},

      {"code":"DIS","email":"qa.dofa.disabled@mygyanvihar.test","name":"QA DoFA Disabled User","role":"Faculty","password":"DofaQA!DIS#2026","active":false,"grants":["ACQUISITION_REQUESTER"]},
      {"code":"EXP","email":"qa.dofa.expired-grant@mygyanvihar.test","name":"QA DoFA Expired Grant User","role":"Faculty","password":"DofaQA!EXP#2026","dept":"A","grantMode":"EXPIRED","grants":["ACQUISITION_REQUESTER"]},
      {"code":"RNG","email":"qa.dofa.role-no-grant@mygyanvihar.test","name":"QA DoFA Role Without Grant","role":"ProcurementHead","password":"DofaQA!RNG#2026","grants":[]},
      {"code":"WSC","email":"qa.dofa.wrong-scope@mygyanvihar.test","name":"QA DoFA Wrong Scope User","role":"Faculty","password":"DofaQA!WSC#2026","dept":"A","grantMode":"WRONG_SCOPE","grants":["ACQUISITION_REQUESTER"]}
    ]
    $personas$::jsonb) AS p(
      code TEXT, email TEXT, name TEXT, role TEXT, dept TEXT,
      password TEXT, active BOOLEAN, "grantMode" TEXT, grants JSONB
    )
  LOOP
    SELECT role_id INTO v_role_id FROM roles WHERE role_name = v.role LIMIT 1;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'DoFA QA role missing: %', v.role;
    END IF;

    INSERT INTO users(
      tenant_id, name, official_email, role_id, dept_id, password_hash,
      onboarding_status, is_active, deleted_at, updated_at
    ) VALUES (
      v_tenant, v.name, lower(v.email), v_role_id,
      CASE v.dept WHEN 'B' THEN v_dept_b WHEN 'A' THEN v_dept_a ELSE NULL END,
      crypt(COALESCE(v.password, format('DofaQA!%s#2026', v.code)), gen_salt('bf', 10)),
      'COMPLETED', COALESCE(v.active, true), NULL, NOW()
    )
    ON CONFLICT(tenant_id, official_email) DO UPDATE SET
      name = EXCLUDED.name,
      role_id = EXCLUDED.role_id,
      dept_id = EXCLUDED.dept_id,
      password_hash = EXCLUDED.password_hash,
      onboarding_status = EXCLUDED.onboarding_status,
      is_active = EXCLUDED.is_active,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING user_id INTO v_user_id;

    UPDATE user_roles SET is_primary = false WHERE user_id = v_user_id;
    INSERT INTO user_roles(user_id, role_id, is_primary)
    VALUES(v_user_id, v_role_id, true)
    ON CONFLICT(user_id, role_id) DO UPDATE SET is_primary = true, deleted_at = NULL;

    DELETE FROM acq_access_grants WHERE tenant_id = v_tenant AND principal_user_id = v_user_id;

    FOR v_capability IN SELECT jsonb_array_elements_text(COALESCE(v.grants, '[]'::jsonb))
    LOOP
      v_scope_type := CASE
        WHEN v."grantMode" = 'WRONG_SCOPE' OR v.code IN ('P01','P02','P09','P21','P26','P29','P31','P32','C01','C08')
          THEN 'DEPARTMENT'
        ELSE 'TENANT'
      END;
      v_scope_reference := CASE
        WHEN v."grantMode" = 'WRONG_SCOPE' THEN v_dept_b::text
        WHEN v_scope_type = 'DEPARTMENT' AND v.dept = 'B' THEN v_dept_b::text
        WHEN v_scope_type = 'DEPARTMENT' THEN v_dept_a::text
        ELSE NULL
      END;

      INSERT INTO acq_access_grants(
        tenant_id, principal_user_id, capability, scope_type, scope_reference,
        valid_from, valid_until
      ) VALUES (
        v_tenant, v_user_id, v_capability, v_scope_type, v_scope_reference,
        CASE WHEN v."grantMode" = 'EXPIRED' THEN NOW() - INTERVAL '2 days' ELSE NOW() END,
        CASE WHEN v."grantMode" = 'EXPIRED' THEN NOW() - INTERVAL '1 day' ELSE NULL END
      );
    END LOOP;
  END LOOP;

  -- Cross-tenant identities are seeded only when the QA database already has a
  -- second tenant. The seed never invents production-like tenant configuration.
  SELECT tenant_id INTO v_other_tenant FROM tenants WHERE tenant_id <> v_tenant ORDER BY created_at LIMIT 1;
  IF v_other_tenant IS NOT NULL THEN
    FOR v IN SELECT * FROM (VALUES
      ('qa.dofa.requester@tenant-b.test','QA DoFA Tenant B Requester','Faculty','DofaQA!TB01#2026'),
      ('qa.dofa.admin@tenant-b.test','QA DoFA Tenant B Admin','TenantAdmin','DofaQA!TB02#2026')
    ) AS q(email,name,role,password)
    LOOP
      SELECT role_id INTO v_role_id FROM roles WHERE role_name = v.role LIMIT 1;
      INSERT INTO users(tenant_id,name,official_email,role_id,password_hash,onboarding_status,is_active,deleted_at,updated_at)
      VALUES(v_other_tenant,v.name,v.email,v_role_id,crypt(v.password,gen_salt('bf',10)),'COMPLETED',true,NULL,NOW())
      ON CONFLICT(tenant_id,official_email) DO UPDATE SET
        name=EXCLUDED.name, role_id=EXCLUDED.role_id, password_hash=EXCLUDED.password_hash,
        onboarding_status='COMPLETED', is_active=true, deleted_at=NULL, updated_at=NOW()
      RETURNING user_id INTO v_user_id;

      UPDATE user_roles SET is_primary=false WHERE user_id=v_user_id;
      INSERT INTO user_roles(user_id,role_id,is_primary) VALUES(v_user_id,v_role_id,true)
      ON CONFLICT(user_id,role_id) DO UPDATE SET is_primary=true, deleted_at=NULL;
      DELETE FROM acq_access_grants WHERE tenant_id=v_other_tenant AND principal_user_id=v_user_id;
      INSERT INTO acq_access_grants(tenant_id,principal_user_id,capability,scope_type)
      VALUES(v_other_tenant,v_user_id,CASE WHEN v.role='Faculty' THEN 'ACQUISITION_REQUESTER' ELSE 'ACQUISITION_AUDIT_OVERSIGHT' END,'TENANT');
    END LOOP;
  ELSE
    RAISE NOTICE 'DoFA QA cross-tenant accounts skipped: no second QA tenant exists';
  END IF;

  RAISE NOTICE 'DoFA QA personas seeded for tenant %', v_tenant;
END
$seed$;
