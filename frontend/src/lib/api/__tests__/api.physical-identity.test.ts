import { describe, expect, it, vi } from "vitest";
import { createPhysicalIdentityApi } from "../api.physical-identity";

describe("physical identity API", () => {
  it("never accepts an operator-supplied permanent identity", async () => {
    const post = vi.fn().mockResolvedValue({});
    const api = createPhysicalIdentityApi({ get: vi.fn(), post });
    await api.requestJob("inventory-1", { job_type: "NEW" });
    expect(post).toHaveBeenCalledWith(
      "/api/physical-identity/v1/inventory/inventory-1/jobs",
      { job_type: "NEW" },
      expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    );
  });

  it("sends revision and idempotency guards for verification", async () => {
    const post = vi.fn().mockResolvedValue({});
    const api = createPhysicalIdentityApi({ get: vi.fn(), post });
    await api.verifyAttachment("job-1", 7, { decision: "VERIFIED" });
    expect(post).toHaveBeenCalledWith(
      "/api/physical-identity/v1/jobs/job-1/verify-attachment",
      { decision: "VERIFIED" },
      expect.objectContaining({
        "If-Match": "7",
        "Idempotency-Key": expect.any(String),
      }),
    );
  });
});
