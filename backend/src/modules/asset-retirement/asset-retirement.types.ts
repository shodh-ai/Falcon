import type { InventoryActor } from '../inventory/inventory.types';

export type AssetRetirementActor = InventoryActor;
export type DispositionMethod =
  | 'AUCTION_SALE'
  | 'DIRECT_SALE'
  | 'CERTIFIED_E_WASTE'
  | 'CERTIFIED_RECYCLING'
  | 'SCRAP'
  | 'DONATION'
  | 'RETURN_TO_VENDOR_TAKEBACK'
  | 'TRANSFER_TO_INSTITUTION'
  | 'CERTIFIED_DESTRUCTION';

export type CreateRetirementCaseInput = {
  inventory_record_ids: string[];
  component_parent_by_inventory_id?: Record<string, string>;
  title: string;
  retirement_reason: string;
  source_service_case_id?: string;
};

export type RetirementAssessmentInput = {
  technical_condition: Record<string, unknown>;
  service_history?: Record<string, unknown>;
  age_and_useful_life: Record<string, unknown>;
  redeployment_assessment: Record<string, unknown>;
  component_recovery?: unknown[];
  legal_holds?: unknown[];
  environmental_classification: Record<string, unknown>;
  data_classification: Record<string, unknown>;
  recommended_disposition: DispositionMethod;
  estimated_disposal_cost?: number;
  expected_proceeds?: number;
  reserve_price?: number;
  currency: string;
};

export type FinancialSnapshotInput = {
  capitalized_cost: number;
  accumulated_depreciation?: number;
  impairment?: number;
  net_book_value: number;
  salvage_value?: number;
  currency: string;
  fiscal_period?: string;
  funding_restrictions?: Record<string, unknown>;
  source_reference: Record<string, unknown>;
  source_revision: number;
};

export type SanitizationInput = {
  inventory_record_id: string;
  method:
    | 'LOGICAL_WIPE'
    | 'CRYPTOGRAPHIC_ERASE'
    | 'FACTORY_RESET'
    | 'MEDIA_DEGAUSS'
    | 'MEDIA_PHYSICAL_DESTRUCTION'
    | 'VENDOR_CERTIFIED_SANITIZATION';
  media_manifest: unknown[];
  tool_and_standard: Record<string, unknown>;
};

export type CompleteSanitizationInput = {
  result: Record<string, unknown>;
  evidence_manifest_hash: string;
  status?: 'VERIFIED' | 'FAILED' | 'PHYSICAL_DESTRUCTION_REQUIRED';
};

export type FinanceProjectionInput = {
  source_event_id?: string;
  projection_type:
    | 'WRITE_OFF'
    | 'PROCEEDS'
    | 'TAX'
    | 'FEE'
    | 'DISPOSAL_COST'
    | 'TRANSPORT_COST'
    | 'GAIN_LOSS'
    | 'GRANT_TREATMENT';
  posting_status: 'REQUESTED' | 'POSTED' | 'FAILED' | 'REVERSED';
  amount?: number;
  currency: string;
  source_reference: Record<string, unknown>;
  failure_reason?: string;
  source_revision: number;
  occurred_at?: string;
};
