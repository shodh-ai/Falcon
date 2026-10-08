-- Provide non-contactable, tenant-scoped vendor fixtures for the explicitly
-- approved GVMC production QA workflow. These records are clearly marked QA
-- and can be replaced by real empanelled vendors before launch.
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM tenants
  WHERE lower(subdomain) = 'gvmc'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO fin_vendors (
    tenant_id, business_name, contact_email, gstin, pan_number,
    default_tds_rate, is_active, gst_verify_status, gst_verified_at,
    gst_legal_name, pan_from_gst
  ) VALUES
    (v_tenant_id, 'GVMC QA Technology Vendor',
     'technology@gvmc.example.invalid', '08AAACG1001A1Z1', 'AAACG1001A',
     2, true, 'VERIFIED', NOW(), 'GVMC QA Technology Vendor', 'AAACG1001A'),
    (v_tenant_id, 'GVMC QA Medical Supplies Vendor',
     'supplies@gvmc.example.invalid', '08AAACG1002A1Z0', 'AAACG1002A',
     2, true, 'VERIFIED', NOW(), 'GVMC QA Medical Supplies Vendor', 'AAACG1002A'),
    (v_tenant_id, 'GVMC QA Service Vendor',
     'service@gvmc.example.invalid', '08AAACG1003A1Z9', 'AAACG1003A',
     2, true, 'VERIFIED', NOW(), 'GVMC QA Service Vendor', 'AAACG1003A')
  ON CONFLICT (tenant_id, gstin) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    contact_email = EXCLUDED.contact_email,
    pan_number = EXCLUDED.pan_number,
    is_active = true,
    gst_verify_status = 'VERIFIED',
    gst_verified_at = NOW(),
    gst_legal_name = EXCLUDED.gst_legal_name,
    pan_from_gst = EXCLUDED.pan_from_gst;

  INSERT INTO acq_vendor_performance (
    tenant_id, vendor_id, category, is_empanelled, compliance_status,
    availability_score, delivery_score, conformity_score,
    invoice_accuracy_score, warranty_service_score, evidence_count
  )
  SELECT
    v_tenant_id,
    vendor.vendor_id,
    '*',
    true,
    'COMPLIANT',
    scores.availability_score,
    scores.delivery_score,
    scores.conformity_score,
    scores.invoice_accuracy_score,
    scores.warranty_service_score,
    scores.evidence_count
  FROM fin_vendors AS vendor
  JOIN (
    VALUES
      ('08AAACG1001A1Z1', 95::numeric, 92::numeric, 96::numeric, 94::numeric, 93::numeric, 15),
      ('08AAACG1002A1Z0', 92::numeric, 95::numeric, 94::numeric, 93::numeric, 90::numeric, 14),
      ('08AAACG1003A1Z9', 90::numeric, 91::numeric, 92::numeric, 96::numeric, 95::numeric, 13)
  ) AS scores(
    gstin, availability_score, delivery_score, conformity_score,
    invoice_accuracy_score, warranty_service_score, evidence_count
  ) ON scores.gstin = vendor.gstin
  WHERE vendor.tenant_id = v_tenant_id
  ON CONFLICT (tenant_id, vendor_id, category) DO UPDATE SET
    is_empanelled = true,
    compliance_status = 'COMPLIANT',
    availability_score = EXCLUDED.availability_score,
    delivery_score = EXCLUDED.delivery_score,
    conformity_score = EXCLUDED.conformity_score,
    invoice_accuracy_score = EXCLUDED.invoice_accuracy_score,
    warranty_service_score = EXCLUDED.warranty_service_score,
    evidence_count = EXCLUDED.evidence_count,
    updated_at = NOW();
END $$;
