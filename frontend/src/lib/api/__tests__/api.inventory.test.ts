import { describe, expect, it, vi } from "vitest";
import { createInventoryApi } from "../api.inventory";
describe("inventory API", () => {
  it("sends concurrency and idempotency headers", async () => {
    const post = vi.fn().mockResolvedValue({});
    const api = createInventoryApi({ get: vi.fn(), post });
    await api.activate("record-1", 4);
    expect(post).toHaveBeenCalledWith(
      "/api/inventory/v1/records/record-1/activate",
      {},
      expect.objectContaining({
        "If-Match": "4",
        "Idempotency-Key": expect.any(String),
      }),
    );
  });
});
