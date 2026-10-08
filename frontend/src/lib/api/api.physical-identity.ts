type Api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
};

export type PhysicalIdentityDashboard = {
  total_jobs: number;
  active_jobs: number;
  awaiting_verification: number;
  failed_jobs: number;
  observations: number;
  review_required: number;
  open_alerts: number;
  devices: { total: number; healthy: number };
};

export type ProvisioningJob = {
  provisioning_job_id: string;
  generation_request_id: string;
  inventory_record_id: string;
  university_asset_id: string;
  logical_rfid_code?: string;
  product_name: string;
  category: string;
  job_type: "NEW" | "RETROFIT" | "REPLACEMENT";
  status: string;
  physical_tag_uid?: string;
  label_serial?: string;
  device_code?: string;
  expires_at: string;
  aggregate_revision: number;
};

export type EligiblePhysicalAsset = {
  inventory_record_id: string;
  university_asset_id: string;
  product_name: string;
  category: string;
  brand?: string;
  model_number?: string;
  record_status: string;
  lifecycle_status: string;
  logical_rfid_code?: string;
  attachment_status?: string;
};

export function createPhysicalIdentityApi(api: Api) {
  const root = "/api/physical-identity/v1";
  const idem = () => ({ "Idempotency-Key": crypto.randomUUID() });
  const mutation = (revision: number) => ({
    ...idem(),
    "If-Match": String(revision),
  });
  return {
    dashboard: () => api.get<PhysicalIdentityDashboard>(`${root}/dashboard`),
    jobs: () => api.get<ProvisioningJob[]>(`${root}/jobs`),
    job: (id: string) => api.get<Record<string, unknown>>(`${root}/jobs/${id}`),
    eligibleAssets: () => api.get<EligiblePhysicalAsset[]>(`${root}/eligible-assets`),
    requestJob: (
      inventoryId: string,
      body: { job_type: "NEW" | "RETROFIT" | "REPLACEMENT"; hardware_profile_id?: string },
    ) => api.post(`${root}/inventory/${inventoryId}/jobs`, body, idem()),
    verifyAttachment: (
      id: string,
      revision: number,
      body: Record<string, unknown>,
    ) => api.post(`${root}/jobs/${id}/verify-attachment`, body, mutation(revision)),
    voidJob: (id: string, revision: number, reason: string) =>
      api.post(`${root}/jobs/${id}/void`, { reason }, mutation(revision)),
    devices: () => api.get<Record<string, unknown>[]>(`${root}/devices`),
    profiles: () => api.get<Record<string, unknown>[]>(`${root}/hardware-profiles`),
    policies: () => api.get<Record<string, unknown>[]>(`${root}/policies`),
    gateObservations: () => api.get<Record<string, unknown>[]>(`${root}/gate/observations`),
    gateAlerts: () => api.get<Record<string, unknown>[]>(`${root}/gate/alerts`),
    actOnAlert: (
      id: string,
      action: "ACKNOWLEDGE" | "ESCALATE" | "RESOLVE",
      resolution?: string,
    ) => api.post(`${root}/gate/alerts/${id}/action`, { action, resolution }, idem()),
  };
}
