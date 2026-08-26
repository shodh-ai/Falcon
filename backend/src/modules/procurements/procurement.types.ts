import type { AcquisitionActor } from '../acquisitions/acquisition.types';

export type ProcurementActor = AcquisitionActor;
export type MoneyInput = number | string;

export type OrderLineInput = {
  proc_case_line_id: string;
  quantity: number;
  unit_price: MoneyInput;
  tax_amount?: MoneyInput;
  freight_amount?: MoneyInput;
  additional_charges?: MoneyInput;
};

export type CreateOrderInput = {
  vendor_id: string;
  external_order_id?: string;
  order_date?: string;
  expected_delivery_date?: string;
  product_url?: string;
  lines: OrderLineInput[];
};

export type ReceiptLineInput = {
  order_line_id: string;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity?: number;
  discrepancy_reason?: string;
};

export type CreateReceiptInput = {
  actual_delivery_date: string;
  notes?: string;
  replacement_for_return_id?: string;
  lines: ReceiptLineInput[];
};

export type InvoiceLineInput = {
  order_line_id: string;
  quantity: number;
  unit_price: MoneyInput;
  tax_amount?: MoneyInput;
  freight_amount?: MoneyInput;
};

export type CreateInvoiceInput = {
  invoice_number: string;
  invoice_date: string;
  currency: string;
  lines: InvoiceLineInput[];
  document_upload_id: string;
};

export type CreateServiceAcceptanceInput = {
  order_line_id: string;
  accepted_quantity: number;
  acceptance_date: string;
  milestone?: string;
};

export type CreateReturnInput = {
  receipt_line_id: string;
  quantity: number;
  attributable_value: MoneyInput;
  reason: string;
};

export type DownstreamStatusInput = {
  source_event_id: string;
  proc_case_line_id: string;
  source_module: string;
  status_type:
    | 'PHYSICAL_VERIFICATION'
    | 'RFID_ALLOCATION'
    | 'ASSET_ID_ALLOCATION'
    | 'INVENTORY_INGESTION'
    | 'CONSUMABLE_LEDGER';
  status: 'PENDING' | 'ENTERED' | 'VERIFIED' | 'FINALIZED' | 'NOT_REQUIRED';
  aggregate_sequence: number;
  occurred_at: string;
  payload?: Record<string, unknown>;
};

export type ProcurementMatchPolicy = {
  match_policy_id: string;
  policy_version: number;
  quantity_tolerance: MoneyInput;
  unit_price_tolerance: MoneyInput;
  tax_tolerance: MoneyInput;
  freight_tolerance: MoneyInput;
  rounding_tolerance: MoneyInput;
  require_receipt: boolean;
  require_service_acceptance: boolean;
};
