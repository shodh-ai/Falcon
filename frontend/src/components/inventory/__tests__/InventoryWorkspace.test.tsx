import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryWorkspace } from "../InventoryWorkspace";
const get = vi.fn();
vi.mock("@/lib/api", () => ({ useAuthedApi: () => ({ get, post: vi.fn() }) }));
describe("InventoryWorkspace", () => {
  beforeEach(() => get.mockReset());
  it("renders authoritative ITEM and LOT queue", async () => {
    get.mockImplementation((path?: string) =>
      Promise.resolve(
        String(path).endsWith("/dashboard")
          ? {
              total: 2,
              active: 1,
              identity_pending: 1,
              quarantined: 0,
              items: 1,
              lots: 1,
            }
          : [
              {
                inventory_record_id: "r1",
                record_type: "ITEM",
                university_asset_id: "AST-FALCON-2026-000001",
                record_status: "ACTIVE",
                lifecycle_status: "AVAILABLE",
                product_model_code: "PRD-FALCON-000001",
                product_name: "Laptop",
                category: "IT",
                batch_code: "BAT-FALCON-202608-000001",
                condition: "GOOD",
                aggregate_revision: 1,
              },
            ],
      ),
    );
    render(<InventoryWorkspace />);
    await waitFor(() => expect(screen.getByText("Laptop")).toBeInTheDocument());
    expect(screen.getByText("AST-FALCON-2026-000001")).toBeInTheDocument();
    expect(
      screen.getByText("Universal Inventory & Identity"),
    ).toBeInTheDocument();
  });
});
