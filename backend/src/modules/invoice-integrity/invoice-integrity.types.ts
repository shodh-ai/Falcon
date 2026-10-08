import type { ProcurementActor } from '../procurements/procurement.types';

export type IntegrityActor = ProcurementActor & {
  mfa_verified_at?: string;
  step_up_verified_at?: string;
};

export type InvoiceType =
  | 'ONLINE_INSTITUTIONAL'
  | 'ONLINE_PERSONAL_EXCEPTION'
  | 'OFFLINE_PRINTED'
  | 'OFFLINE_HANDWRITTEN';

export type FactorStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'INSUFFICIENT'
  | 'NOT_APPLICABLE';

export type RiskFactor = {
  name: string;
  weight: number;
  status: FactorStatus;
  normalized_score?: number;
  confidence?: number;
  raw_inputs?: Record<string, unknown>;
  explanation?: string;
};

export type IntegrityBlocker =
  | 'VENDOR_IDENTITY_MISMATCH'
  | 'ORDER_IDENTITY_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'DUPLICATE_TRANSACTION'
  | 'DOCUMENT_REPLACEMENT'
  | 'SOURCE_ACCOUNT_MISMATCH'
  | 'TENANT_MISMATCH'
  | 'MATERIAL_AMOUNT_DIFFERENCE'
  | 'UNTRUSTED_SOURCE'
  | 'SOURCE_PAYLOAD_INVALID';

export type SourceSnapshotInput = {
  source_account_id: string;
  retrieval_attempt_id?: string;
  source_platform: string;
  external_transaction_id: string;
  source_revision?: string;
  retrieval_method:
    | 'API_OAUTH'
    | 'PLATFORM_EXPORT'
    | 'ATTENDED_BROWSER'
    | 'MANUAL_ORIGINAL_UPLOAD'
    | 'VENDOR_CONFIRMATION';
  payload: Record<string, unknown>;
};

export type MarketObservationInput = {
  source: string;
  source_url_or_reference: string;
  captured_at: string;
  applicable_purchase_date?: string;
  observed_price: number;
  currency: string;
  product_identifier: string;
  variant?: string;
  condition?: string;
  availability?: string;
  shipping_amount?: number;
  tax_included?: boolean;
};

export type HumanDecisionInput = {
  investigation_id: string;
  decision: 'CLEARED_HUMAN' | 'REJECTED_UNRESOLVED';
  decision_reason: string;
};
