import { describe, expect, it, vi } from "vitest";
import { createAssetRetirementApi } from "../api.asset-retirement";

describe("asset retirement API", () => {
  it("sends revision and idempotency headers for workflow mutations", async () => {
    const api = { get: vi.fn(), post: vi.fn().mockResolvedValue({}) },
      retirement = createAssetRetirementApi(api);
    await retirement.submit("case-1", 7);
    expect(api.post).toHaveBeenCalledWith(
      "/api/asset-retirement/v1/cases/case-1/submit",
      {},
      expect.objectContaining({
        "If-Match": "7",
        "Idempotency-Key": expect.any(String),
      }),
    );
  });

  it("uses separate physical, Finance and certificate endpoints", async () => {
    const api = { get: vi.fn(), post: vi.fn().mockResolvedValue({}) },
      retirement = createAssetRetirementApi(api);
    await retirement.requestFinance("case-1", 8);
    await retirement.issueCertificate("case-1", 9);
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/api/asset-retirement/v1/cases/case-1/finance/request",
      {},
      expect.any(Object),
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/api/asset-retirement/v1/cases/case-1/certificates",
      {},
      expect.any(Object),
    );
  });
});
