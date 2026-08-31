import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionWorkspace } from "../AcquisitionWorkspace";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  useAuthedApi: () => mocks,
}));

vi.mock("@/lib/notifications/falcon-toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("AcquisitionWorkspace persona queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue([
      {
        acquisition_id: "acq-1",
        acquisition_number: "ACQ-2099-000001",
        acquisition_version_id: "version-1",
        version_number: 1,
        status: "PENDING_DOFA",
        priority: "HIGH",
        required_by_date: "2099-02-01",
        estimated_total: 1250,
        currency: "INR",
        source: "FALCON",
        created_at: "2099-01-01T00:00:00Z",
      },
    ]);
  });

  it("renders scoped lifecycle counts and the immutable workflow record", async () => {
    render(<AcquisitionWorkspace />);
    expect(
      screen.getByRole("heading", { name: "Digital Acquisitions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Requester → Procurement → Budget → DoFA/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("ACQ-2099-000001")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("PENDING DOFA")).toHaveLength(2);
    expect(screen.getByText("₹1,250.00")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("/api/acquisitions/v1");
  });

  it("opens a multi-line wizard with online/offline and funding controls", async () => {
    render(<AcquisitionWorkspace />);
    await screen.findByText("ACQ-2099-000001");
    fireEvent.click(screen.getByRole("button", { name: /New acquisition/i }));
    expect(screen.getByText("Acquisition wizard")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Funding source ID"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Technical specifications"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add product line" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Excel preview")).toBeInTheDocument();
  });
});
