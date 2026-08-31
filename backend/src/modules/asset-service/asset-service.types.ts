import type { InventoryActor } from '../inventory/inventory.types';

export type AssetServiceActor = InventoryActor;
export type ServiceCaseType =
  | 'CORRECTIVE_REPAIR'
  | 'WARRANTY_CLAIM'
  | 'PREVENTIVE_MAINTENANCE'
  | 'CALIBRATION'
  | 'INSPECTION'
  | 'INTERNAL_MAINTENANCE'
  | 'EXTERNAL_SERVICE'
  | 'ACCIDENTAL_DAMAGE'
  | 'MODULE7_REPAIR_REFERRAL';

export type CreateServiceCaseInput = {
  inventory_record_id: string;
  case_type: ServiceCaseType;
  title: string;
  problem_description: string;
  severity?: 'LOW' | 'NORMAL' | 'HIGH' | 'SAFETY_CRITICAL';
  module7_case_id?: string;
  component?: {
    component_inventory_record_id?: string;
    component_name: string;
    manufacturer_serial?: string;
    component_reference?: Record<string, unknown>;
  };
};

export type CoverageInput = {
  coverage_status:
    | 'IN_WARRANTY'
    | 'AMC_COVERED'
    | 'INTERNAL_SERVICE'
    | 'CHARGEABLE'
    | 'NOT_COVERED'
    | 'EXCEPTION_REQUIRED';
  source_precedence: unknown[];
  coverage_payload: Record<string, unknown>;
  policy_version: number;
  exception_approved?: boolean;
  exception_approver_id?: string;
};

export type DiagnosisInput = {
  fault_codes?: string[];
  root_cause?: string;
  safety_impact?: string;
  proposed_work: string;
  requires_reverification?: boolean;
  reverification_reasons?: string[];
};

export type EstimateInput = {
  labor_amount?: number;
  parts_amount?: number;
  travel_amount?: number;
  other_amount?: number;
  currency: string;
  estimated_duration_hours?: number;
  approval_reference?: Record<string, unknown>;
};

export type AcceptServiceInput = {
  decision:
    | 'ACCEPTED'
    | 'ACCEPTED_WITH_LIMITATIONS'
    | 'REJECTED'
    | 'IRREPARABLE'
    | 'UNSAFE';
  reason: string;
  limitations?: Record<string, unknown>;
};
