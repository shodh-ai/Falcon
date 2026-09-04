import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcurementWorkspace } from "../ProcurementWorkspace";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ useAuthedApi: () => ({ get, post: vi.fn() }) }));
vi.mock("@/lib/notifications/falcon-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("Module 2 persona workspace", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((path: string) =>
      path.endsWith("/dashboard")
        ? Promise.resolve({
            approved_allocation: 100000,
            available_amount: 40000,
            committed_amount: 20000,
            expended_amount: 40000,
            released_amount: 0,
            cases: 1,
            alerts: [],
          })
        : Promise.resolve([
            {
              proc_case_id: "case-1",
              acquisition_number: "ACQ-2026-001",
              status: "ACTIVE",
              currency: "INR",
              approved_allocation: 100000,
              available_amount: 40000,
              committed_amount: 20000,
              expended_amount: 40000,
              released_amount: 0,
              aggregate_revision: 3,
              allocation_age_days: 5,
              inactive_days: 1,
              utilization_percent: 40,
            },
          ]),
    );
  });
  it("shows allocation buckets and the scoped progressive queue", async () => {
    render(<ProcurementWorkspace />);
    expect(await screen.findByText("ACQ-2026-001")).toBeInTheDocument();
    expect(screen.getByText("Progressive Procurement")).toBeInTheDocument();
    expect(screen.getByText("₹1,00,000.00")).toBeInTheDocument();
    expect(screen.getAllByText("₹40,000.00")).toHaveLength(2);
  });
  it("loads scoped cases without mixing them into a cumulative dashboard", async () => {
    render(<ProcurementWorkspace />);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/procurements/v1/cases"),
    );
    expect(get).not.toHaveBeenCalledWith("/api/procurements/v1/dashboard");
    expect(screen.getByLabelText("Procurement requirement")).toBeInTheDocument();
    expect(screen.getByText("Open this procurement case")).toBeInTheDocument();
  });
});
