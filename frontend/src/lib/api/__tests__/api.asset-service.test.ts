import { vi } from "vitest";
import { createAssetServiceApi } from "../api.asset-service";
describe("asset service api", () => {
  it("uses version and idempotency guards", async () => {
    const post = vi.fn().mockResolvedValue({}),
      api = createAssetServiceApi({ get: vi.fn(), post });
    await api.accept("svc-1", 8, {
      decision: "ACCEPTED",
      reason: "tests passed",
    });
    expect(post).toHaveBeenCalledWith(
      "/api/asset-service/v1/cases/svc-1/accept",
      { decision: "ACCEPTED", reason: "tests passed" },
      expect.objectContaining({
        "If-Match": "8",
        "Idempotency-Key": expect.any(String),
      }),
    );
  });
  it("uses the Module 8 route root", async () => {
    const get = vi.fn().mockResolvedValue([]),
      api = createAssetServiceApi({ get, post: vi.fn() });
    await api.cases();
    expect(get).toHaveBeenCalledWith("/api/asset-service/v1/cases");
  });
});
