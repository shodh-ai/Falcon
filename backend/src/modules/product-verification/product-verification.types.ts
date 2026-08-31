import type { ProcurementActor } from '../procurements/procurement.types';

export type ProductVerificationActor = ProcurementActor;
export type SubjectType = 'ITEM' | 'LOT';
export type AttributeOutcome =
  | 'MATCHED'
  | 'MISMATCHED'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type PolicyAttribute = {
  attribute_name: string;
  weight: number;
  required: boolean;
  hard_identifier: boolean;
  comparison_method: string;
  normalization_rule?: string;
  tolerance?: Record<string, unknown> | number | string;
  ai_mode: 'DISABLED' | 'OPTIONAL' | 'REQUIRED_FOR_AUTOMATION';
};

export type ObservedAttribute = {
  attribute_name: string;
  value?: unknown;
  outcome?: AttributeOutcome;
  extraction_method?: string;
  extraction_confidence?: number;
};

export type CaptureLocation = {
  latitude?: number;
  longitude?: number;
  accuracy_metres?: number;
};

export type CreateLotInput = {
  observed_quantity: number;
  unit_of_measure: string;
  batch_number?: string;
  expiry_date?: string;
  manufacture_date?: string;
  manufacturer?: string;
};

export type InvoiceAllocationInput = {
  invoice_line_id: string;
  allocated_quantity: number;
};

export type AnalyzeSubjectInput = {
  observed_attributes: ObservedAttribute[];
  deterministic_signals?: Record<string, unknown>;
  ai?: {
    model_version?: string;
    prompt_policy_version?: string;
    sanitized_input_hash?: string;
    output_hash?: string;
    confidence?: number;
    status: 'NOT_USED' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';
  };
};
