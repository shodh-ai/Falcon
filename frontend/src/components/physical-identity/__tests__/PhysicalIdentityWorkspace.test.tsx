import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhysicalIdentityWorkspace } from "../PhysicalIdentityWorkspace";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ useAuthedApi: () => ({ get, post: vi.fn() }) }));

describe("PhysicalIdentityWorkspace", () => {
  beforeEach(() => get.mockReset());

  it("renders the signed provisioning queue without claiming inventory authority", async () => {
    get.mockImplementation((path?: string) => {
      const value = String(path);
      if (value.endsWith("/dashboard"))
        return Promise.resolve({
          total_jobs: 1,
          active_jobs: 1,
          awaiting_verification: 0,
          failed_jobs: 0,
          observations: 0,
          review_required: 0,
          open_alerts: 0,
          devices: { total: 1, healthy: 1 },
        });
      if (value.endsWith("/jobs"))
        return Promise.resolve([
          {
            provisioning_job_id: "job-1",
            generation_request_id: "request-1",
            inventory_record_id: "inventory-1",
            university_asset_id: "AST-FALCON-2026-000001",
            logical_rfid_code: "RFI-FALCON-2026-000001",
            product_name: "Laptop",
            category: "IT",
            job_type: "NEW",
            status: "AUTHORIZED",
            expires_at: new Date().toISOString(),
            aggregate_revision: 1,
          },
        ]);
      return Promise.resolve([]);
    });
    render(<PhysicalIdentityWorkspace />);
    await waitFor(() => expect(screen.getByText(/Laptop/)).toBeInTheDocument());
    expect(screen.getByText("Physical Identity & Gate Observation")).toBeInTheDocument();
    expect(screen.getByText(/Operators cannot enter or change Asset\/RFID IDs/)).toBeInTheDocument();
  });
});
