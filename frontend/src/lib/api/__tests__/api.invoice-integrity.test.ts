import { describe, expect, it, vi } from "vitest";
import { createInvoiceIntegrityApi } from "../api.invoice-integrity";

describe("invoice-integrity API", () => {
  it("uses the isolated versioned Module 3 endpoints", async () => {
    const client = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}) };
    const api = createInvoiceIntegrityApi(client);
    await api.list("MANUAL_REVIEW");
    await api.dashboard();
    await api.get("integrity-1");
    expect(client.get).toHaveBeenNthCalledWith(1, "/api/invoice-integrity/v1/cases?state=MANUAL_REVIEW");
    expect(client.get).toHaveBeenNthCalledWith(2, "/api/invoice-integrity/v1/dashboard");
    expect(client.get).toHaveBeenNthCalledWith(3, "/api/invoice-integrity/v1/cases/integrity-1");
  });

  it("pins the exact case revision and idempotency key for analysis", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "analysis-key" });
    const client = { get: vi.fn(), post: vi.fn().mockResolvedValue({}) };
    const api = createInvoiceIntegrityApi(client);
    await api.analyze("integrity-1", 4);
    expect(client.post).toHaveBeenCalledWith(
      "/api/invoice-integrity/v1/cases/integrity-1/analyze",
      {},
      { "If-Match": "4", "Idempotency-Key": "analysis-key" },
    );
    vi.unstubAllGlobals();
  });
});
