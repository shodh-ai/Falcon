import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcurementCaseWorkspace } from "../ProcurementCaseWorkspace";

const get = vi.fn();
const post = vi.fn();
const authedApi = { get, post };
vi.mock("@/lib/api", () => ({ useAuthedApi: () => authedApi }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "ProcurementBuyer", primaryRole: "ProcurementBuyer" },
  }),
}));
vi.mock("@/lib/notifications/falcon-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const detail = {
  proc_case_id: "case-1",
  acquisition_id: "acq-1",
  acquisition_version_id: "version-1",
  acquisition_number: "ACQ-2026-000001",
  requester_id: "requester-1",
  acquisition_snapshot_hash: "hash",
  budget_reservation_id: "budget-1",
  status: "ACTIVE",
  currency: "INR",
  approved_allocation: 1000,
  available_amount: 1000,
  committed_amount: 0,
  expended_amount: 0,
  released_amount: 0,
  aggregate_revision: 3,
  allocation_age_days: 1,
  inactive_days: 0,
  utilization_percent: 0,
  verified_unpaid_liability: 0,
  lines: [
    {
      proc_case_line_id: "case-line-1",
      product_name: "Physics Lab Laptop",
      fulfillment_type: "GOODS",
      approved_vendor_id: "vendor-1",
      approved_quantity: 3,
      approved_unit_price: 100,
      unit: "item",
    },
    {
      proc_case_line_id: "case-line-2",
      product_name: "Laptop installation",
      fulfillment_type: "INSTALLATION",
      approved_vendor_id: "vendor-1",
      approved_quantity: 1,
      approved_unit_price: 50,
      unit: "service",
    },
  ],
  orders: [
    {
      order_id: "order-1",
      order_number: "PO-0001",
      status: "ISSUED",
      total_amount: 350,
    },
  ],
  order_lines: [
    {
      order_line_id: "order-line-1",
      order_id: "order-1",
      proc_case_line_id: "case-line-1",
      quantity: 3,
      unit_price: 100,
    },
    {
      order_line_id: "order-line-2",
      order_id: "order-1",
      proc_case_line_id: "case-line-2",
      fulfillment_type: "INSTALLATION",
      quantity: 1,
      unit_price: 50,
    },
  ],
  receipts: [],
  receipt_lines: [],
  service_acceptances: [],
  invoices: [],
  invoice_lines: [],
  payments: [],
  adjustments: [],
  returns: [],
  repairs: [],
  downstream_status: [],
  ledger: [],
  audit_timeline: [],
  integrity_projections: [],
};

describe("Module 2 case operations", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/vendors") ? [] : detail),
    );
    post.mockResolvedValue({});
  });

  it("exposes goods receipt and independent service acceptance actions", async () => {
    render(<ProcurementCaseWorkspace caseId="case-1" />);
    expect(await screen.findByText("ACQ-2026-000001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RECEIPTS" }));

    expect(
      screen.getByRole("button", { name: "Mark sealed package received" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record service acceptance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Service line · ordered 1" }),
    ).toBeInTheDocument();
  });

  it("uses the issued order classification for the service acceptance dropdown", async () => {
    const caseLine = detail.lines[1];
    const originalClassification = caseLine.fulfillment_type;
    caseLine.fulfillment_type = "GOODS";

    try {
      render(<ProcurementCaseWorkspace caseId="case-1" />);
      expect(await screen.findByText("ACQ-2026-000001")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "RECEIPTS" }));

      expect(
        screen.getByRole("option", { name: "Service line · ordered 1" }),
      ).toBeInTheDocument();
    } finally {
      caseLine.fulfillment_type = originalClassification;
    }
  });

  it("exposes document-backed invoice entry and gated payment", async () => {
    render(<ProcurementCaseWorkspace caseId="case-1" />);
    expect(await screen.findByText("ACQ-2026-000001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "INVOICES" }));

    expect(
      screen.getByRole("button", { name: "Create invoice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Post payment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No invoice is payment-eligible yet/),
    ).toBeInTheDocument();
  });
});
