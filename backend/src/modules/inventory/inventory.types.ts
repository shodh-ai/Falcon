import type { ProcurementActor } from '../procurements/procurement.types';

export type InventoryActor = ProcurementActor;
export type RecordType = 'ITEM' | 'LOT';
export type MovementType =
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'ISSUE'
  | 'ISSUE_RETURN'
  | 'CONSUMPTION'
  | 'RETURN'
  | 'WRITE_OFF';

export type PrepareIdentityInput = {
  manufacturer_serial?: string;
  attributes?: Record<string, unknown>;
  owner_department_id?: number;
  custodian_user_id?: string;
  location_space_id?: string;
  location_text?: string;
  condition?: string;
};

export type EncodeRfidInput = {
  physical_tag_uid: string;
  tag_technology: string;
  encoder_device_id: string;
  encoded_payload_hash: string;
  key_version?: string;
};
