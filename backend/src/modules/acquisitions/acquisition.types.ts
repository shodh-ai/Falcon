export const ACQUISITION_STATUSES = [
  'DRAFT',
  'VALIDATED',
  'VENDOR_REVIEW',
  'BUDGET_RESERVED',
  'PENDING_DOFA',
  'APPROVED',
  'BUDGET_BLOCKED',
  'REJECTED',
  'WITHDRAWN',
  'SUPERSEDED',
  'EXPIRED',
] as const;

export type AcquisitionStatus = (typeof ACQUISITION_STATUSES)[number];
export type AcquisitionLayout = 'ONLINE' | 'OFFLINE' | 'GENERAL';
export type AcquisitionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ItemClassification = 'ASSET' | 'CONSUMABLE' | 'SERVICE';

export type AcquisitionLineInput = {
  acquisition_layout: AcquisitionLayout;
  product_name: string;
  category: string;
  quantity: number;
  unit?: string;
  brand?: string;
  model_number?: string;
  part_number?: string;
  technical_specifications?: Record<string, unknown> | string;
  product_description?: string;
  intended_use: string;
  estimated_unit_price: number;
  delivery_cost?: number;
  tax_cost?: number;
  installation_cost?: number;
  service_cost?: number;
  miscellaneous_cost?: number;
  preferred_vendor_id?: string;
  preferred_vendor_name?: string;
  product_url?: string;
  vendor_contact?: string;
  vendor_address?: string;
  vendor_business_reference?: string;
  return_policy?: string;
  replacement_policy?: string;
  return_window_days?: number;
  doa_window_days?: number;
  return_conditions?: Record<string, unknown>;
  replacement_conditions?: Record<string, unknown>;
  refund_conditions?: Record<string, unknown>;
  restocking_fee_policy?: Record<string, unknown>;
  return_shipping_responsibility?:
    | 'BUYER'
    | 'VENDOR'
    | 'SHARED'
    | 'UNSPECIFIED';
  policy_source_reference?: string;
  warranty_requirements?: string;
  expected_delivery_days?: number;
  item_classification: ItemClassification;
  expected_service_life_months?: number;
  special_procurement_requirements?: string;
  remarks?: string;
};

export type CreateAcquisitionInput = {
  requesting_department_id?: number;
  intended_department_id?: number;
  intended_lab_or_project?: string;
  intended_use_case: string;
  required_by_date: string;
  priority?: AcquisitionPriority;
  funding_source_type:
    | 'DEPARTMENT'
    | 'PROGRAM'
    | 'PROJECT'
    | 'RESEARCH_GRANT'
    | 'INSTITUTIONAL'
    | 'OTHER';
  funding_source_id: string;
  expected_service_life_months?: number;
  default_item_classification?: ItemClassification;
  installation_or_service_required?: boolean;
  special_procurement_requirements?: string;
  remarks?: string;
  currency?: string;
  source?: 'FALCON' | 'IRMS' | 'INVENTORY_REPLENISHMENT' | 'ASSET_SERVICE';
  external_reference?: string;
  /** Set only by the authenticated IRMS integration boundary. */
  integration_client_id?: string;
  lines: AcquisitionLineInput[];
};

export type AcquisitionActor = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
  department_id?: number | null;
};

export type VendorScoreWeights = {
  price: number;
  delivery: number;
  conformity: number;
  invoice_accuracy: number;
  warranty_service: number;
  compliance: number;
  availability: number;
};

export type VendorScoreInput = {
  price?: number | null;
  delivery?: number | null;
  conformity?: number | null;
  invoice_accuracy?: number | null;
  warranty_service?: number | null;
  compliance?: number | null;
  availability?: number | null;
  evidence_count: number;
};
