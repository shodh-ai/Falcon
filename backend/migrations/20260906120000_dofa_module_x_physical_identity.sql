-- DoFA Module X: trusted physical identity provisioning and gate observation.

CREATE TABLE IF NOT EXISTS pix_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  policy_version INT NOT NULL CHECK(policy_version>0),
  status VARCHAR(16) NOT NULL CHECK(status IN('DRAFT','PUBLISHED','SUPERSEDED')),
  category VARCHAR(120) NOT NULL DEFAULT '*',
  product_model_id UUID REFERENCES inv_product_models(product_model_id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  rfid_value_threshold NUMERIC(15,2) NOT NULL DEFAULT 500 CHECK(rfid_value_threshold>=0),
  qr_required BOOLEAN NOT NULL DEFAULT true,
  code128_required BOOLEAN NOT NULL DEFAULT true,
  rfid_required BOOLEAN,
  excluded BOOLEAN NOT NULL DEFAULT false,
  allowed_hardware_profiles JSONB NOT NULL DEFAULT '[]',
  allowed_tag_technologies JSONB NOT NULL DEFAULT '["NFC_HF","UHF"]',
  attachment_methods JSONB NOT NULL DEFAULT '[]',
  tamper_evidence_class VARCHAR(40) NOT NULL DEFAULT 'TAMPER_EVIDENT',
  verification_requirements JSONB NOT NULL DEFAULT '{}',
  camera_evidence_enabled BOOLEAN NOT NULL DEFAULT false,
  routine_retention_days INT NOT NULL DEFAULT 180 CHECK(routine_retention_days>0),
  alert_retention_days INT NOT NULL DEFAULT 2557 CHECK(alert_retention_days>0),
  gate_cache_minutes INT NOT NULL DEFAULT 30 CHECK(gate_cache_minutes BETWEEN 1 AND 60),
  retrofit_allowed BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(), effective_to TIMESTAMPTZ,
  published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,policy_version,category,product_model_id)
);

CREATE TABLE IF NOT EXISTS pix_label_templates (
  label_template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  template_version INT NOT NULL CHECK(template_version>0), name VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK(status IN('DRAFT','PUBLISHED','SUPERSEDED')),
  dimensions JSONB NOT NULL DEFAULT '{}', fields JSONB NOT NULL DEFAULT '["UNIVERSITY_ASSET_ID","SIGNED_QR","CODE128"]',
  rendered_template_hash CHAR(64) NOT NULL, published_by UUID REFERENCES users(user_id), published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,template_version,name)
);

CREATE TABLE IF NOT EXISTS pix_hardware_profiles (
  hardware_profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  profile_code VARCHAR(120) NOT NULL, device_type VARCHAR(32) NOT NULL CHECK(device_type IN('KIOSK','RFID_ENCODER','LABEL_PRINTER','COMBINED_PRINTER','FIXED_GATE_READER','HANDHELD_READER','SMARTPHONE_NFC','SIMULATOR')),
  manufacturer VARCHAR(160), model VARCHAR(160), supported_technologies JSONB NOT NULL DEFAULT '[]',
  minimum_firmware VARCHAR(80), driver_adapter VARCHAR(120) NOT NULL, simulator_only BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','INACTIVE','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,profile_code)
);

CREATE TABLE IF NOT EXISTS pix_devices (
  device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  hardware_profile_id UUID NOT NULL REFERENCES pix_hardware_profiles(hardware_profile_id) ON DELETE RESTRICT,
  device_code VARCHAR(120) NOT NULL, device_type VARCHAR(32) NOT NULL,
  campus_reference VARCHAR(160), location_reference VARCHAR(200), gate_reference VARCHAR(160),
  certificate_fingerprint CHAR(64) NOT NULL, public_key TEXT NOT NULL, firmware_version VARCHAR(80) NOT NULL,
  attestation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(attestation_status IN('PENDING','ATTESTED','FAILED','EXPIRED','REVOKED')),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','ACTIVE','SUSPENDED','REVOKED')),
  last_attested_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, registered_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,device_code), UNIQUE(certificate_fingerprint)
);

CREATE TABLE IF NOT EXISTS pix_provisioning_jobs (
  provisioning_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), generation_request_id UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  inventory_revision BIGINT NOT NULL, subject_id UUID NOT NULL REFERENCES pv_subjects(subject_id) ON DELETE RESTRICT,
  verification_identity_id UUID NOT NULL REFERENCES pv_verification_identities(verification_identity_id) ON DELETE RESTRICT,
  university_asset_id VARCHAR(120) NOT NULL, logical_rfid_id UUID REFERENCES inv_logical_rfids(logical_rfid_id) ON DELETE RESTRICT,
  logical_rfid_code VARCHAR(120), policy_id UUID NOT NULL REFERENCES pix_policies(policy_id) ON DELETE RESTRICT,
  policy_version INT NOT NULL, label_template_id UUID NOT NULL REFERENCES pix_label_templates(label_template_id) ON DELETE RESTRICT,
  label_template_version INT NOT NULL, allowed_hardware_profile_id UUID NOT NULL REFERENCES pix_hardware_profiles(hardware_profile_id) ON DELETE RESTRICT,
  job_type VARCHAR(16) NOT NULL DEFAULT 'NEW' CHECK(job_type IN('NEW','RETROFIT','REPLACEMENT')),
  status VARCHAR(28) NOT NULL DEFAULT 'AUTHORIZED' CHECK(status IN('REQUESTED','AUTHORIZED','CLAIMED','ENCODING','PRINTING','ATTACHMENT_PENDING','VERIFICATION_PENDING','COMPLETED','FAILED','CANCELLED','EXPIRED','VOIDED','SUPERSEDED')),
  nonce_hash CHAR(64) NOT NULL UNIQUE, authorization_payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL,
  signature_algorithm VARCHAR(16) NOT NULL DEFAULT 'Ed25519' CHECK(signature_algorithm='Ed25519'), signing_key_version VARCHAR(80) NOT NULL, signature TEXT NOT NULL,
  claimed_by_device_id UUID REFERENCES pix_devices(device_id) ON DELETE RESTRICT, claimed_by UUID REFERENCES users(user_id), claimed_at TIMESTAMPTZ,
  operator_id UUID REFERENCES users(user_id), verifier_id UUID REFERENCES users(user_id),
  physical_tag_uid VARCHAR(240), tag_technology VARCHAR(80), encoded_payload_hash CHAR(64),
  label_serial VARCHAR(160), label_payload_hash CHAR(64), qr_payload_hash CHAR(64) NOT NULL, code128_value VARCHAR(160) NOT NULL,
  attachment_evidence_hash CHAR(64), failure_code VARCHAR(80), failure_detail TEXT,
  expires_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ, aggregate_revision BIGINT NOT NULL DEFAULT 1,
  next_event_sequence BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(expires_at>created_at), CHECK(code128_value IS NULL OR code128_value=university_asset_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pix_active_inventory_job ON pix_provisioning_jobs(inventory_record_id) WHERE status IN('AUTHORIZED','CLAIMED','ENCODING','PRINTING','ATTACHMENT_PENDING','VERIFICATION_PENDING');
CREATE UNIQUE INDEX IF NOT EXISTS uq_pix_physical_tag_once ON pix_provisioning_jobs(tenant_id,upper(physical_tag_uid)) WHERE physical_tag_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pix_label_serial ON pix_provisioning_jobs(tenant_id,label_serial) WHERE label_serial IS NOT NULL;

CREATE TABLE IF NOT EXISTS pix_job_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  provisioning_job_id UUID NOT NULL REFERENCES pix_provisioning_jobs(provisioning_job_id) ON DELETE RESTRICT,
  device_id UUID NOT NULL REFERENCES pix_devices(device_id) ON DELETE RESTRICT, attempt_number INT NOT NULL CHECK(attempt_number>0),
  action VARCHAR(32) NOT NULL CHECK(action IN('CLAIM','ENCODE','PRINT','ATTACH','VERIFY','VOID')),
  request_hash CHAR(64) NOT NULL, result_hash CHAR(64), status VARCHAR(16) NOT NULL CHECK(status IN('STARTED','SUCCEEDED','FAILED','VOIDED')),
  hardware_response JSONB NOT NULL DEFAULT '{}', actor_id UUID REFERENCES users(user_id), occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provisioning_job_id,attempt_number,action)
);

CREATE TABLE IF NOT EXISTS pix_attachment_verifications (
  attachment_verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  provisioning_job_id UUID NOT NULL REFERENCES pix_provisioning_jobs(provisioning_job_id) ON DELETE RESTRICT,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  physical_tag_uid VARCHAR(240), scanned_asset_id VARCHAR(120) NOT NULL,
  scanned_rfid_payload_hash CHAR(64), scanned_qr_payload_hash CHAR(64) NOT NULL,
  evidence_manifest JSONB NOT NULL DEFAULT '[]', evidence_manifest_hash CHAR(64) NOT NULL,
  verifier_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT, decision VARCHAR(16) NOT NULL CHECK(decision IN('VERIFIED','REJECTED')),
  decision_reason TEXT, verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(provisioning_job_id)
);

CREATE TABLE IF NOT EXISTS pix_movement_permits (
  movement_permit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_module VARCHAR(24) NOT NULL CHECK(source_module IN('MODULE5','MODULE7','MODULE8','MODULE9')),
  source_type VARCHAR(80) NOT NULL, source_id UUID NOT NULL, source_decision_id UUID, source_revision BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','USED','EXPIRED','REVOKED','SUPERSEDED')),
  permitted_gates JSONB NOT NULL DEFAULT '[]', direction VARCHAR(12) NOT NULL CHECK(direction IN('ENTRY','EXIT','BOTH')),
  destination JSONB, responsible_party_id UUID REFERENCES users(user_id), provider_reference VARCHAR(200),
  valid_from TIMESTAMPTZ NOT NULL, valid_until TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL, signature TEXT NOT NULL, signing_key_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id,source_module,source_type,source_id,source_revision), CHECK(valid_until>valid_from)
);
CREATE TABLE IF NOT EXISTS pix_movement_permit_assets (
  movement_permit_id UUID NOT NULL REFERENCES pix_movement_permits(movement_permit_id) ON DELETE RESTRICT,
  inventory_record_id UUID NOT NULL REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  inventory_revision BIGINT NOT NULL, logical_rfid_id UUID REFERENCES inv_logical_rfids(logical_rfid_id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','OBSERVED','REVOKED')),
  PRIMARY KEY(movement_permit_id,inventory_record_id)
);

CREATE TABLE IF NOT EXISTS pix_gate_observations (
  gate_observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES pix_devices(device_id) ON DELETE RESTRICT, device_sequence BIGINT NOT NULL CHECK(device_sequence>0),
  gate_reference VARCHAR(160) NOT NULL, direction VARCHAR(8) NOT NULL CHECK(direction IN('ENTRY','EXIT')),
  physical_tag_uid VARCHAR(240) NOT NULL, inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  logical_rfid_id UUID REFERENCES inv_logical_rfids(logical_rfid_id) ON DELETE RESTRICT, inventory_revision BIGINT,
  movement_permit_id UUID REFERENCES pix_movement_permits(movement_permit_id) ON DELETE RESTRICT,
  result VARCHAR(24) NOT NULL CHECK(result IN('AUTHORIZED_PASSAGE','REVIEW_REQUIRED')),
  reason_code VARCHAR(80) NOT NULL, device_observed_at TIMESTAMPTZ NOT NULL, server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_metadata JSONB NOT NULL DEFAULT '{}', cache_issued_at TIMESTAMPTZ, cache_expires_at TIMESTAMPTZ,
  payload_hash CHAR(64) NOT NULL, device_signature TEXT NOT NULL, camera_evidence_reference TEXT,
  retention_until TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(device_id,device_sequence)
);

CREATE TABLE IF NOT EXISTS pix_gate_alerts (
  gate_alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  gate_observation_id UUID NOT NULL UNIQUE REFERENCES pix_gate_observations(gate_observation_id) ON DELETE RESTRICT,
  inventory_record_id UUID REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  alert_type VARCHAR(64) NOT NULL, severity VARCHAR(16) NOT NULL DEFAULT 'REVIEW' CHECK(severity IN('REVIEW','HIGH','CRITICAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','ACKNOWLEDGED','ESCALATED','RESOLVED')),
  acknowledged_by UUID REFERENCES users(user_id), acknowledged_at TIMESTAMPTZ, resolution TEXT, resolved_by UUID REFERENCES users(user_id), resolved_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pix_inventory_projections (
  inventory_record_id UUID PRIMARY KEY REFERENCES inv_records(inventory_record_id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, provisioning_job_id UUID NOT NULL UNIQUE REFERENCES pix_provisioning_jobs(provisioning_job_id) ON DELETE RESTRICT,
  physical_tag_uid VARCHAR(240), label_serial VARCHAR(160), attachment_status VARCHAR(16) NOT NULL CHECK(attachment_status IN('PENDING','VERIFIED','REJECTED','VOIDED')),
  attachment_verification_id UUID REFERENCES pix_attachment_verifications(attachment_verification_id) ON DELETE RESTRICT,
  source_event_id UUID NOT NULL UNIQUE, source_payload_hash CHAR(64) NOT NULL, verified_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pix_idempotency (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, actor_reference VARCHAR(200) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL, request_hash CHAR(64) NOT NULL, response_payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_id,actor_reference,idempotency_key)
);
CREATE TABLE IF NOT EXISTS pix_audit_events (
  audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  aggregate_type VARCHAR(40) NOT NULL, aggregate_id UUID NOT NULL, action VARCHAR(80) NOT NULL,
  actor_reference VARCHAR(200) NOT NULL, previous_value JSONB, new_value JSONB, previous_event_hash CHAR(64), event_hash CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pix_outbox_events (
  event_id UUID PRIMARY KEY, event_type VARCHAR(120) NOT NULL, event_version INT NOT NULL DEFAULT 1,
  aggregate_id UUID NOT NULL, aggregate_revision BIGINT NOT NULL, aggregate_sequence BIGINT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE, occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL, payload_hash CHAR(64) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','PROCESSING','PUBLISHED','FAILED')),
  attempts INT NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(aggregate_id,aggregate_sequence)
);
CREATE TABLE IF NOT EXISTS pix_consumed_events (
  event_id UUID PRIMARY KEY, event_type VARCHAR(120) NOT NULL, tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  source_payload_hash CHAR(64) NOT NULL, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inv_rfid_bindings ADD COLUMN IF NOT EXISTS module_x_provisioning_job_id UUID REFERENCES pix_provisioning_jobs(provisioning_job_id) ON DELETE RESTRICT;
ALTER TABLE inv_rfid_bindings ADD COLUMN IF NOT EXISTS attachment_verified_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_module_x_job_binding ON inv_rfid_bindings(module_x_provisioning_job_id) WHERE module_x_provisioning_job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION pix_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'PHYSICAL_IDENTITY_APPEND_ONLY'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_pix_attempt_immutable BEFORE UPDATE OR DELETE ON pix_job_attempts FOR EACH ROW EXECUTE FUNCTION pix_append_only();
CREATE TRIGGER tr_pix_attachment_immutable BEFORE UPDATE OR DELETE ON pix_attachment_verifications FOR EACH ROW EXECUTE FUNCTION pix_append_only();
CREATE TRIGGER tr_pix_observation_immutable BEFORE UPDATE OR DELETE ON pix_gate_observations FOR EACH ROW EXECUTE FUNCTION pix_append_only();
CREATE TRIGGER tr_pix_audit_immutable BEFORE UPDATE OR DELETE ON pix_audit_events FOR EACH ROW EXECUTE FUNCTION pix_append_only();

CREATE OR REPLACE FUNCTION pix_guard_identity_authority() RETURNS trigger AS $$
BEGIN
  IF TG_OP='INSERT' AND (NEW.university_asset_id IS NULL OR NEW.authorization_payload->>'university_asset_id' IS DISTINCT FROM NEW.university_asset_id) THEN
    RAISE EXCEPTION 'MODULE_X_IDENTITY_MUST_BE_MODULE5_AUTHORIZED';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.inventory_record_id<>OLD.inventory_record_id OR NEW.university_asset_id<>OLD.university_asset_id OR NEW.logical_rfid_id IS DISTINCT FROM OLD.logical_rfid_id OR NEW.authorization_payload IS DISTINCT FROM OLD.authorization_payload OR NEW.payload_hash<>OLD.payload_hash OR NEW.signature<>OLD.signature OR NEW.qr_payload_hash<>OLD.qr_payload_hash OR NEW.code128_value<>OLD.code128_value) THEN
    RAISE EXCEPTION 'MODULE_X_AUTHORIZATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_pix_job_identity_authority BEFORE INSERT OR UPDATE ON pix_provisioning_jobs FOR EACH ROW EXECUTE FUNCTION pix_guard_identity_authority();

CREATE INDEX IF NOT EXISTS idx_pix_jobs_queue ON pix_provisioning_jobs(tenant_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_pix_gate_observations ON pix_gate_observations(tenant_id,gate_reference,server_received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pix_gate_alerts ON pix_gate_alerts(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pix_outbox_pending ON pix_outbox_events(status,available_at) WHERE status IN('PENDING','FAILED');

INSERT INTO pix_hardware_profiles(tenant_id,profile_code,device_type,supported_technologies,minimum_firmware,driver_adapter,simulator_only)
VALUES(NULL,'DETERMINISTIC-SIMULATOR','SIMULATOR','["NFC_HF","UHF","QR","CODE128"]','1.0.0','deterministic-simulator',true)
ON CONFLICT(tenant_id,profile_code) DO NOTHING;

DO $$ DECLARE t RECORD; template_id UUID; profile_id UUID; BEGIN
  SELECT hardware_profile_id INTO profile_id FROM pix_hardware_profiles WHERE tenant_id IS NULL AND profile_code='DETERMINISTIC-SIMULATOR';
  FOR t IN SELECT tenant_id FROM tenants LOOP
    INSERT INTO pix_label_templates(tenant_id,template_version,name,status,rendered_template_hash,published_at)
    VALUES(t.tenant_id,1,'Standard Asset Label','PUBLISHED',encode(digest('STANDARD_ASSET_LABEL_V1','sha256'),'hex'),NOW())
    ON CONFLICT DO NOTHING RETURNING label_template_id INTO template_id;
    IF template_id IS NULL THEN SELECT label_template_id INTO template_id FROM pix_label_templates WHERE tenant_id=t.tenant_id AND template_version=1 AND name='Standard Asset Label'; END IF;
    INSERT INTO pix_policies(tenant_id,policy_version,status,category,currency,rfid_value_threshold,allowed_hardware_profiles,attachment_methods,published_at)
    VALUES(t.tenant_id,1,'PUBLISHED','*','INR',500,jsonb_build_array(profile_id), '["DESTRUCTIVE_ADHESIVE","LAMINATED","EMBEDDED","ASSET_SPECIFIC"]',NOW()) ON CONFLICT DO NOTHING;
    INSERT INTO acq_access_grants(tenant_id,principal_role,capability,scope_type)
    SELECT t.tenant_id,x.role_name,x.capability,'TENANT' FROM (VALUES
      ('Stores','PHYSICAL_IDENTITY_VIEW'),('Stores','PHYSICAL_IDENTITY_PROVISION'),('InventoryVerifier','PHYSICAL_IDENTITY_VIEW'),('InventoryVerifier','PHYSICAL_IDENTITY_ATTACH_VERIFY'),
      ('Security','GATE_ASSET_OBSERVE'),('Security','GATE_ASSET_REVIEW'),('ProcurementHead','PHYSICAL_IDENTITY_RECONCILE'),
      ('InternalAuditor','PHYSICAL_IDENTITY_VIEW'),('InternalAuditor','PHYSICAL_IDENTITY_AUDIT'),
      ('SuperAdmin','PHYSICAL_IDENTITY_VIEW'),('SuperAdmin','PHYSICAL_IDENTITY_PROVISION'),('SuperAdmin','PHYSICAL_IDENTITY_ATTACH_VERIFY'),('SuperAdmin','PHYSICAL_IDENTITY_RETROFIT'),('SuperAdmin','PHYSICAL_IDENTITY_RECONCILE'),('SuperAdmin','PHYSICAL_IDENTITY_DEVICE_ADMIN'),('SuperAdmin','PHYSICAL_IDENTITY_POLICY_ADMIN'),('SuperAdmin','GATE_ASSET_OBSERVE'),('SuperAdmin','GATE_ASSET_REVIEW'),('SuperAdmin','GATE_ASSET_ESCALATE'),('SuperAdmin','PHYSICAL_IDENTITY_AUDIT')
    ) x(role_name,capability) WHERE NOT EXISTS(SELECT 1 FROM acq_access_grants g WHERE g.tenant_id=t.tenant_id AND g.principal_role=x.role_name AND g.capability=x.capability AND g.scope_type='TENANT');
  END LOOP;
END $$;

INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module_x_physical_identity',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module_x_provisioning_gate',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module_x_gate_observation',false FROM tenants ON CONFLICT DO NOTHING;
INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) SELECT tenant_id,'dofa_module_x_retrofit',false FROM tenants ON CONFLICT DO NOTHING;
