import { vi } from "vitest";
import { createReturnsApi } from "../api.returns";
describe("returns api", () => {
  it("uses guarded versioned approval mutations", async () => {
    const post = vi.fn().mockResolvedValue({}),
      api = createReturnsApi({ get: vi.fn(), post });
    await api.approve("case-1", 7, { disposition: "RETURN_ONLY" });
    expect(post).toHaveBeenCalledWith(
      "/api/returns/v1/cases/case-1/approve",
      { disposition: "RETURN_ONLY" },
      expect.objectContaining({
        "If-Match": "7",
        "Idempotency-Key": expect.any(String),
      }),
    );
  });
  it("uses the exact return/DOA route root", async () => {
    const get = vi.fn().mockResolvedValue([]),
      api = createReturnsApi({ get, post: vi.fn() });
    await api.cases();
    expect(get).toHaveBeenCalledWith("/api/returns/v1/cases");
  });
});
