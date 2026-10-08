import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceIntegrityWorkspace } from "../InvoiceIntegrityWorkspace";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ useAuthedApi: () => ({ get, post: vi.fn() }) }));
vi.mock("@/lib/notifications/falcon-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("Module 3 Finance integrity workspace", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((path: string) =>
      path.endsWith("/dashboard")
        ? Promise.resolve({
            total_cases: 1,
            by_state: { MANUAL_REVIEW: 1 },
            source_unavailable: 1,
            high_risk: 0,
            pending_certification: 0,
          })
        : Promise.resolve([
            {
              integrity_case_id: "integrity-1",
              invoice_id: "invoice-1",
              invoice_revision: 2,
              invoice_number: "INV-42",
              invoice_type: "OFFLINE_PRINTED",
              workflow_state: "MANUAL_REVIEW",
              analysis_result: "SOURCE_UNAVAILABLE",
              trust_level: "ANALYZED_ONLY",
              vendor_name: "Vendor One",
              order_number: "PO-42",
              total_amount: 25000,
              currency: "INR",
              aggregate_revision: 4,
              updated_at: "2026-08-27T00:00:00Z",
            },
          ]),
    );
  });

  it("shows the scoped evidence-verification queue", async () => {
    render(<InvoiceIntegrityWorkspace />);
    expect(await screen.findByText("INV-42")).toBeInTheDocument();
    expect(screen.getByText("Invoice Integrity")).toBeInTheDocument();
    expect(screen.getByText("₹25,000.00")).toBeInTheDocument();
    expect(screen.getAllByText("SOURCE UNAVAILABLE").length).toBeGreaterThan(0);
  });

  it("loads both cases and the integrity dashboard", async () => {
    render(<InvoiceIntegrityWorkspace />);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/invoice-integrity/v1/cases"),
    );
    expect(get).toHaveBeenCalledWith("/api/invoice-integrity/v1/dashboard");
  });
});
