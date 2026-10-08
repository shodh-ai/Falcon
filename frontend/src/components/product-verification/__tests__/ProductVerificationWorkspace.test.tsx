import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductVerificationWorkspace } from "../ProductVerificationWorkspace";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ useAuthedApi: () => ({ get, post: vi.fn() }) }));
vi.mock("@/lib/notifications/falcon-toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("Module 4 physical verification workspace", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((path: string) =>
      path.endsWith("/dashboard")
        ? Promise.resolve({ total_cases: 1, awaiting_capture: 0, manual_review: 1, closed: 0, subjects: 2, verified_subjects: 1 })
        : Promise.resolve([{
            verification_case_id: "verification-1",
            workflow_state: "MANUAL_REVIEW",
            subject_type: "ITEM",
            eligible_quantity: 2,
            unit_of_measure: "unit",
            product_name: "Latitude 5450",
            category: "IT",
            receipt_number: "GRN-42",
            order_number: "PO-42",
            subject_count: 2,
            verified_count: 1,
            aggregate_revision: 4,
            updated_at: "2026-08-27T00:00:00Z",
          }]),
    );
  });

  it("shows the scoped receiving and review queue", async () => {
    render(<ProductVerificationWorkspace />);
    expect(await screen.findByText("Latitude 5450")).toBeInTheDocument();
    expect(screen.getByText("Physical Product Verification")).toBeInTheDocument();
    expect(screen.getByText("1/2 verified")).toBeInTheDocument();
  });

  it("loads both cases and the Module 4 dashboard", async () => {
    render(<ProductVerificationWorkspace />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/product-verification/v1/cases"));
    expect(get).toHaveBeenCalledWith("/api/product-verification/v1/dashboard");
  });
});
