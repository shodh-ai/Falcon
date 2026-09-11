import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumablesWorkspace } from "../ConsumablesWorkspace";

const get = vi.fn();
const post = vi.fn();
const authedApi = { get, post };
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "requester-1", dept_id: 7 } }),
}));
vi.mock("@/lib/api", () => ({ useAuthedApi: () => authedApi }));
vi.mock("@/lib/notifications/falcon-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("Module 6 consumables request entry", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation((path: string) => {
      if (path.endsWith("/dashboard")) {
        return Promise.resolve({
          lots: 0,
          store_on_hand: 0,
          submitted: 0,
          active: 0,
          open_alerts: 0,
          issued_custody_outstanding: 0,
        });
      }
      if (path.endsWith("/products")) {
        return Promise.resolve([
          {
            product_model_id: "glove-model-1",
            product_model_code: "GLV-001",
            product_name: "Physics Lab Gloves",
            category: "LAB_CONSUMABLE",
          },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  it("offers a catalog-backed create request form", async () => {
    render(<ConsumablesWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Create request" }));

    expect(screen.getByText("Create stock request")).toBeInTheDocument();
    expect(screen.getByText(/Physics Lab Gloves/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create request draft" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Department ID")).toHaveValue(7);
  });
});
