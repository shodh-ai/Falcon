import type { InventoryActor } from '../inventory/inventory.types';

export type PhysicalIdentityActor = InventoryActor;

export type DeviceContext = {
  device_id: string;
  tenant_id: string;
  device_code: string;
  device_type: string;
  hardware_profile_id: string;
  gate_reference?: string | null;
  sequence: number;
};

export type RegisterDeviceInput = {
  device_code: string;
  hardware_profile_id: string;
  device_type: string;
  campus_reference?: string;
  location_reference?: string;
  gate_reference?: string;
  certificate_fingerprint: string;
  public_key: string;
  firmware_version: string;
};

export type EncodingResultInput = {
  physical_tag_uid: string;
  tag_technology: string;
  encoded_payload_hash: string;
  hardware_response?: Record<string, unknown>;
};

export type PrintResultInput = {
  label_serial: string;
  label_payload_hash: string;
  qr_payload_hash: string;
  hardware_response?: Record<string, unknown>;
};

export type AttachmentResultInput = {
  evidence_manifest: unknown[];
  evidence_manifest_hash: string;
};

export type VerifyAttachmentInput = {
  scanned_asset_id: string;
  scanned_physical_tag_uid?: string;
  scanned_rfid_payload_hash?: string;
  scanned_qr_payload_hash: string;
  evidence_manifest?: unknown[];
  decision: 'VERIFIED' | 'REJECTED';
  decision_reason?: string;
};

export type GateObservationInput = {
  device_sequence: number;
  gate_reference: string;
  direction: 'ENTRY' | 'EXIT';
  physical_tag_uid: string;
  device_observed_at: string;
  signal_metadata?: Record<string, unknown>;
  cache_issued_at?: string;
  cache_expires_at?: string;
  camera_evidence_reference?: string;
  payload_hash: string;
  device_signature: string;
};
