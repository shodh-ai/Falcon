import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HrApiPolicyWorkspace } from "../HrApiPolicyWorkspace";
const mocks = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    entityId: 7,
    entityReady: true,
  },
}));
vi.mock("@/lib/api/use-hr-api", () => ({ useHrApi: () => mocks.api }));
const sheet = {
  categories: [
    {
      key: "teaching",
      label: "Teaching",
      weight: 100,
      metrics: [
        {
          key: "delivery",
          label: "Teaching delivery",
          method: "TARGET",
          unit: "percent",
          max_points: 100,
          points_per_unit: 1,
          target: 100,
          evidence_required: true,
        },
      ],
    },
  ],
};
const policy = {
  policy_id: "policy-1",
  designation: "Assistant Professor",
  assessment_year: 2026,
  title: "Example policy",
  sheet,
  status: "DRAFT",
  version: 1,
  revision: 1,
};
const metadata = (editable = true) => ({
  items: [policy],
  employees: [
    {
      user_id: "employee-1",
      name: "Example Faculty",
      designation: "Assistant Professor",
    },
  ],
  designations: ["Assistant Professor"],
  can_edit: editable,
  template: {
    label: "Illustrative sheet",
    notice: "Illustrative only; institutional HR approval required",
    reference_url: "https://www.ugc.gov.in/",
    sheet,
  },
});
describe("HR designation policy editor", () => {
  beforeEach(() => {
    mocks.api.get.mockReset().mockResolvedValue(metadata());
    mocks.api.post.mockReset().mockResolvedValue(policy);
    mocks.api.patch.mockReset().mockResolvedValue({ ...policy, revision: 2 });
  });
  afterEach(cleanup);
  it("loads an explicitly illustrative sheet without publishing or changing an appraisal", async () => {
    render(<HrApiPolicyWorkspace />);
    expect(await screen.findByText(/Illustrative only/)).toBeInTheDocument();
    expect(screen.getByLabelText("Designation")).toHaveValue("");
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.api.patch).not.toHaveBeenCalled();
  });
  it("creates a draft with a stable idempotency key, not an active policy", async () => {
    render(<HrApiPolicyWorkspace />);
    await screen.findByLabelText("Designation");
    fireEvent.change(screen.getByLabelText("Designation"), {
      target: { value: "Assistant Professor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(mocks.api.post).toHaveBeenCalledWith(
        "/api/hr/appraisal-policies",
        expect.objectContaining({ designation: "Assistant Professor", sheet }),
        { "Idempotency-Key": expect.any(String) },
      ),
    );
    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish saved policy" }),
    ).toBeDisabled();
  });
  it("preserves raw scoring mode when a criterion is edited", async () => {
    render(<HrApiPolicyWorkspace />);
    await screen.findByLabelText("Scoring mode");
    fireEvent.change(screen.getByLabelText("Scoring mode"), {
      target: { value: "RAW_POINTS" },
    });
    fireEvent.change(screen.getByLabelText("Criterion"), {
      target: { value: "Reviewed delivery" },
    });
    expect(screen.getByLabelText("Scoring mode")).toHaveValue("RAW_POINTS");
    expect(screen.getByLabelText("Weight (%)")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Designation"), {
      target: { value: "Professor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(mocks.api.post).toHaveBeenCalledWith(
        "/api/hr/appraisal-policies",
        expect.objectContaining({
          sheet: expect.objectContaining({ scoring_mode: "RAW_POINTS" }),
        }),
        expect.any(Object),
      ),
    );
  });
  it("requires acknowledgment and an approval reference, and publishes only the saved revision", async () => {
    render(<HrApiPolicyWorkspace />);
    await screen.findByLabelText("Saved policy/version");
    fireEvent.change(screen.getByLabelText("Saved policy/version"), {
      target: { value: "policy-1" },
    });
    fireEvent.change(
      screen.getByLabelText("Institutional approval reference"),
      { target: { value: "HR committee approval 2026" } },
    );
    expect(
      screen.getByRole("button", { name: "Publish saved policy" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/HR has reviewed these rules/));
    expect(
      screen.getByRole("button", { name: "Publish saved policy" }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Policy title"), {
      target: { value: "Unsaved change" },
    });
    expect(
      screen.getByRole("button", { name: "Publish saved policy" }),
    ).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
  it("uses the server calculation and invalidates the preview when input changes", async () => {
    mocks.api.post.mockResolvedValue({
      calculation: {
        total: 75,
        maximum: 100,
        complete: true,
        issues: [],
        categories: [],
        disclaimer: "Calculation only, not final approval",
      },
    });
    render(<HrApiPolicyWorkspace />);
    await screen.findByLabelText("Designation");
    fireEvent.change(screen.getByLabelText("Teaching delivery (percent)"), {
      target: { value: "75" },
    });
    fireEvent.change(
      screen.getByLabelText("Evidence reference — Teaching delivery"),
      { target: { value: "Reviewed teaching register" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Calculate preview" }));
    expect(
      await screen.findByText("Calculated score: 75 / 100"),
    ).toBeInTheDocument();
    expect(mocks.api.post).toHaveBeenCalledWith(
      "/api/hr/appraisal-policies/preview",
      {
        sheet,
        inputs: {
          delivery: { value: 75, evidence: "Reviewed teaching register" },
        },
      },
    );
    fireEvent.change(screen.getByLabelText("Teaching delivery (percent)"), {
      target: { value: "50" },
    });
    expect(
      screen.queryByText("Calculated score: 75 / 100"),
    ).not.toBeInTheDocument();
  });
  it("does not expose write actions to a read-only HR reviewer", async () => {
    mocks.api.get.mockResolvedValue(metadata(false));
    render(<HrApiPolicyWorkspace />);
    await screen.findByLabelText("Designation");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Copy into new draft/version" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Calculate preview" }),
    ).toBeEnabled();
  });
  it("reports a failed load instead of presenting a fictitious empty policy list", async () => {
    mocks.api.get.mockRejectedValue(
      new Error("Policy schema is not installed locally"),
    );
    render(<HrApiPolicyWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "schema is not installed",
    );
    expect(
      screen.queryByRole("button", { name: "Save draft" }),
    ).not.toBeInTheDocument();
  });
});
