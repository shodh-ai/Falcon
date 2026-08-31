export type InventorySummary = {
  inventory_record_id: string;
  record_type: "ITEM" | "LOT";
  university_asset_id?: string;
  lot_id?: string;
  logical_rfid_code?: string;
  record_status: string;
  lifecycle_status: string;
  product_model_code: string;
  product_name: string;
  category: string;
  brand?: string;
  model_number?: string;
  batch_code: string;
  location_text?: string;
  condition: string;
  aggregate_revision: number;
};
export type InventoryDashboard = {
  total: number;
  active: number;
  identity_pending: number;
  quarantined: number;
  items: number;
  lots: number;
};
export type InventoryDetail = InventorySummary & {
  manufacturer_serial?: string;
  owner_department_id?: number;
  custodian_user_id?: string;
  source: Record<string, unknown>[];
  identity_revisions: Record<string, unknown>[];
  rfid: Record<string, unknown> | null;
  lot_movements: Record<string, unknown>[];
  state_history: Record<string, unknown>[];
  discrepancies: Record<string, unknown>[];
  financial_projections: Record<string, unknown>[];
  audit_timeline: Record<string, unknown>[];
};
type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
};
export function createInventoryApi(api: Api) {
  const root = "/api/inventory/v1";
  const headers = (revision: number) => ({
    "If-Match": String(revision),
    "Idempotency-Key": crypto.randomUUID(),
  });
  return {
    dashboard: () => api.get<InventoryDashboard>(`${root}/dashboard`),
    list: (search?: string, status?: string) =>
      api.get<InventorySummary[]>(
        `${root}/records?${new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}) })}`,
      ),
    get: (id: string) => api.get<InventoryDetail>(`${root}/records/${id}`),
    prepare: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(
        `${root}/records/${id}/identity/prepare`,
        body,
        headers(revision),
      ),
    encode: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/records/${id}/rfid/encode`, body, headers(revision)),
    verify: (id: string, bindingId: string, revision: number) =>
      api.post(
        `${root}/records/${id}/rfid/${bindingId}/verify`,
        {},
        headers(revision),
      ),
    activate: (id: string, revision: number) =>
      api.post(`${root}/records/${id}/activate`, {}, headers(revision)),
    revokeRfid: (
      id: string,
      revision: number,
      body: { reason: string; status?: "LOST" | "REVOKED" },
    ) => api.post(`${root}/records/${id}/rfid/revoke`, body, headers(revision)),
    requestStateChange: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(`${root}/records/${id}/state-changes`, body, headers(revision)),
    acknowledgeStateChange: (id: string, historyId: string, revision: number) =>
      api.post(
        `${root}/records/${id}/state-changes/${historyId}/acknowledge`,
        {},
        headers(revision),
      ),
    moveLot: (id: string, revision: number, body: Record<string, unknown>) =>
      api.post(`${root}/records/${id}/lot-movements`, body, headers(revision)),
    transferLot: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(`${root}/records/${id}/lot-transfers`, body, headers(revision)),
    discrepancy: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(`${root}/records/${id}/discrepancies`, body, headers(revision)),
    resolve: (
      id: string,
      discrepancyId: string,
      revision: number,
      body: Record<string, unknown>,
    ) =>
      api.post(
        `${root}/records/${id}/discrepancies/${discrepancyId}/resolve`,
        body,
        headers(revision),
      ),
    policies: () =>
      api.get<{
        identifier_policy: Record<string, unknown> | null;
        category_policies: Record<string, unknown>[];
      }>(`${root}/policies`),
    legacyQueue: () =>
      api.get<Record<string, unknown>[]>(`${root}/legacy/reconciliation`),
    reconcileLegacy: (body: Record<string, unknown>) =>
      api.post(`${root}/legacy/reconciliation`, body, {
        "Idempotency-Key": crypto.randomUUID(),
      }),
  };
}
