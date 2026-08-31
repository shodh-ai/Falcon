import { createConsumablesApi } from "../api.consumables";
import { vi } from "vitest";

describe("consumables api", () => {
  it("uses the versioned root and mutation guards", async () => {
    const post = vi.fn().mockResolvedValue({});
    const api = createConsumablesApi({ get: vi.fn(), post });
    await api.approve("request-1", 4, {});
    expect(post).toHaveBeenCalledWith(
      "/api/consumables/v1/requests/request-1/approve",
      {},
      expect.objectContaining({
        "If-Match": "4",
        "Idempotency-Key": expect.any(String),
      }),
    );
  });
  it("converts replenishment through its governed endpoint", async () => {
    const post = vi.fn().mockResolvedValue({});
    const api = createConsumablesApi({ get: vi.fn(), post });
    await api.convert("suggestion-1", { funding_source_id: "fund" });
    expect(post.mock.calls[0][0]).toBe(
      "/api/consumables/v1/replenishment/suggestion-1/convert",
    );
  });
});
