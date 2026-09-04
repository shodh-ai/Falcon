import { describe, expect, it, vi } from "vitest";
import { createProcurementsApi } from "../api.procurements";

describe("progressive procurement API", () => {
  it("uses the versioned Module 2 endpoints", async () => {
    const client = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({}),
    };
    const api = createProcurementsApi(client);
    await api.list("ACTIVE");
    await api.dashboard();
    await api.get("case-1");
    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/api/procurements/v1/cases?status=ACTIVE",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      "/api/procurements/v1/dashboard",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      3,
      "/api/procurements/v1/cases/case-1",
    );
  });
  it("pins optimistic revision and idempotency headers", async () => {
    const client = { get: vi.fn(), post: vi.fn().mockResolvedValue({}) };
    const api = createProcurementsApi(client);
    await api.issueOrder("case-1", "order-1", 7, "issue-key");
    expect(client.post).toHaveBeenCalledWith(
      "/api/procurements/v1/cases/case-1/orders/order-1/issue",
      {},
      { "If-Match": "7", "Idempotency-Key": "issue-key" },
    );
  });
  it("keeps payment and finalization as explicit idempotent actions", async () => {
    const client = { get: vi.fn(), post: vi.fn().mockResolvedValue({}) };
    const api = createProcurementsApi(client);
    await api.postPayment("case-1", "invoice-1", 9, "pay-key", { amount: 100 });
    await api.finalize("case-1", 10, "final-key");
    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/api/procurements/v1/cases/case-1/invoices/invoice-1/payments",
      { amount: 100 },
      { "If-Match": "9", "Idempotency-Key": "pay-key" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/api/procurements/v1/cases/case-1/finalize",
      {},
      { "If-Match": "10", "Idempotency-Key": "final-key" },
    );
  });
  it("binds requester product confirmation to an exact receipt line", async () => {
    const client = { get: vi.fn(), post: vi.fn().mockResolvedValue({}) };
    const api = createProcurementsApi(client);
    await api.confirmReceivedProduct("case-1", "receipt-line-1", 12, "upload-1");
    expect(client.post).toHaveBeenCalledWith(
      "/api/procurements/v1/cases/case-1/receipt-lines/receipt-line-1/confirm-product",
      { document_upload_id: "upload-1" },
      { "If-Match": "12" },
    );
  });
});
