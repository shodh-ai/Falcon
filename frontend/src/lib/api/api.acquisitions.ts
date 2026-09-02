export type AcquisitionStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'VENDOR_REVIEW'
  | 'BUDGET_RESERVED'
  | 'PENDING_DOFA'
  | 'APPROVED'
  | 'BUDGET_BLOCKED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'SUPERSEDED'
  | 'EXPIRED';

export type AcquisitionLineInput = {
  acquisition_layout: 'ONLINE' | 'OFFLINE' | 'GENERAL';
  product_name: string;
  category: string;
  quantity: number;
  unit: string;
  technical_specifications: string;
  intended_use: string;
  estimated_unit_price: number;
  delivery_cost?: number;
  tax_cost?: number;
  installation_cost?: number;
  service_cost?: number;
  miscellaneous_cost?: number;
  product_url?: string;
  preferred_vendor_name?: string;
  warranty_requirements?: string;
  expected_delivery_days?: number;
  item_classification: 'ASSET' | 'CONSUMABLE' | 'SERVICE';
  special_procurement_requirements?: string;
};

export type AcquisitionDraftInput = {
  intended_lab_or_project?: string;
  intended_use_case: string;
  required_by_date: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  funding_source_type:
    | 'DEPARTMENT'
    | 'PROGRAM'
    | 'PROJECT'
    | 'RESEARCH_GRANT'
    | 'INSTITUTIONAL'
    | 'OTHER';
  funding_source_id: string;
  special_procurement_requirements?: string;
  remarks?: string;
  currency: string;
  lines: AcquisitionLineInput[];
};

export type AcquisitionSummary = {
  acquisition_id: string;
  acquisition_number: string;
  acquisition_version_id: string | null;
  version_number: number;
  status: AcquisitionStatus | string;
  priority?: string;
  required_by_date?: string;
  estimated_total: number | string;
  currency: string;
  source: string;
  created_at: string;
};

export type AcquisitionDetail = AcquisitionSummary & {
  requester_id: string;
  intended_use_case: string;
  intended_lab_or_project?: string;
  funding_source_type: string;
  funding_source_id: string;
  special_procurement_requirements?: string;
  snapshot_hash?: string;
  lines: AcquisitionLineRecord[];
  recommendations: VendorRecommendationRecord[];
  budget_reservation?: BudgetReservationRecord | null;
  dofa_route?: DofaRouteRecord | null;
  approval_decisions: ApprovalDecisionRecord[];
  audit_timeline: AuditEventRecord[];
  allowed_actions: Record<string, boolean>;
};

export type AcquisitionLineRecord = {
  line_id: string;
  line_number: number;
  line_status: string;
  product_name: string;
  category: string;
  quantity: number | string;
  unit: string;
  acquisition_layout: string;
  technical_specifications: unknown;
  estimated_line_total: number | string;
  validation_errors?: string[];
};
export type VendorRecommendationRecord = {
  recommendation_id: string;
  line_id: string;
  vendor_id: string;
  vendor_name: string;
  rank: number;
  explanation: string;
  confidence: string;
  scoring_policy_version: number;
  final_score: number | string;
};
export type BudgetReservationRecord = {
  budget_reservation_id: string;
  amount: number | string;
  currency: string;
  status: string;
  expires_at: string;
};
export type DofaRouteRecord = {
  route_snapshot_hash: string;
  approval_route: Array<{ level: number; required_role: string }>;
};
export type ApprovalDecisionRecord = {
  decision: string;
  approver_role: string;
  decision_at: string;
  decision_hash: string;
};
export type AuditEventRecord = {
  event_type: string;
  created_at: string;
  event_hash: string;
};
export type AcquisitionMutationResult = {
  acquisition_id?: string;
  acquisition_number?: string;
  acquisition_version_id?: string;
  valid?: boolean;
  errors?: unknown[];
  warnings?: unknown[];
};
export type ImportPreview = {
  import_preview_id: string;
  row_count: number;
  malware_scan_status: string;
  validation: { valid: boolean; errors: unknown[]; warnings: unknown[] };
};

export type AcquisitionFundingSource = {
  funding_source_type: AcquisitionDraftInput['funding_source_type'];
  funding_source_id: string;
  label: string;
  available_amount: number;
};

type AuthedApi = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  getBlob?(path: string): Promise<Blob>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  put<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};

export function createAcquisitionsApi(api: AuthedApi) {
  const root = '/api/acquisitions/v1';
  return {
    list: (status?: string) =>
      api.get<AcquisitionSummary[]>(
        `${root}${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    fundingSources: (type?: AcquisitionDraftInput['funding_source_type']) =>
      api.get<AcquisitionFundingSource[]>(
        `${root}/funding-sources${type ? `?type=${encodeURIComponent(type)}` : ''}`,
      ),
    template: () => {
      if (!api.getBlob) throw new Error('File download is unavailable');
      return api.getBlob(`${root}/imports/template`);
    },
    get: (versionId: string) =>
      api.get<AcquisitionDetail>(`${root}/versions/${versionId}`),
    create: (input: AcquisitionDraftInput) =>
      api.post<AcquisitionMutationResult>(root, input),
    replace: (versionId: string, input: AcquisitionDraftInput) =>
      api.put(`${root}/versions/${versionId}`, input),
    updateFundingSource: (
      versionId: string,
      input: Pick<
        AcquisitionDraftInput,
        'funding_source_type' | 'funding_source_id'
      >,
    ) =>
      api.put<AcquisitionDetail>(
        `${root}/versions/${versionId}/funding-source`,
        input,
      ),
    validate: (versionId: string) =>
      api.post<AcquisitionMutationResult>(
        `${root}/versions/${versionId}/validate`,
      ),
    submit: (versionId: string) =>
      api.post<AcquisitionDetail>(`${root}/versions/${versionId}/submit`),
    recommend: (versionId: string) =>
      api.post<AcquisitionDetail>(
        `${root}/versions/${versionId}/recommendations`,
      ),
    selectVendors: (
      versionId: string,
      selections: Array<{
        line_id: string;
        vendor_id: string;
        deviation_justification?: string;
      }>,
    ) =>
      api.post<AcquisitionDetail>(
        `${root}/versions/${versionId}/vendor-selection`,
        { selections },
      ),
    withdraw: (versionId: string) =>
      api.post<AcquisitionDetail>(`${root}/versions/${versionId}/withdraw`),
    amend: (versionId: string) =>
      api.post<AcquisitionMutationResult>(
        `${root}/versions/${versionId}/amend`,
      ),
    previewImport: (form: FormData) =>
      api.post<ImportPreview>(`${root}/imports/preview`, form),
    commitImport: (previewId: string) =>
      api.post<AcquisitionMutationResult>(
        `${root}/imports/${previewId}/commit`,
      ),
  };
}
