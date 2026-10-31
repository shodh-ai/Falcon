import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HodAttendanceUnlockApprovalsPage from "@/app/(portals)/hod/approvals/attendance-unlocks/page";

const { api, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ useAuthedApi: () => api }));
vi.mock("@/lib/notifications/falcon-toast", () => ({ toast }));

const request = {
  request_id: "request-1",
  class_date: "2026-10-20",
  reason: "Browser failed after class",
  requested_at: "2026-10-30T09:00:00.000Z",
  course_code: "DA101",
  course_name: "Digital Assignment Studio",
  faculty_name: "Faculty One",
  faculty_email: "faculty@example.invalid",
  class_adjustment_id: null,
  section: "A",
  start_time: "09:00:00",
  end_time: "10:00:00",
};

beforeEach(() => {
  api.get.mockReset().mockResolvedValue([request]);
  api.patch.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("HOD attendance unlock approvals", () => {
  it("shows the exact faculty, course, section, date, session and reason", async () => {
    render(<HodAttendanceUnlockApprovalsPage />);
    expect(await screen.findByText("Faculty One · DA101")).toBeTruthy();
    expect(screen.getByText(/Section A/)).toBeTruthy();
    expect(screen.getByText(/09:00–10:00/)).toBeTruthy();
    expect(screen.getByText("Browser failed after class")).toBeTruthy();
  });

  it("submits an explicit HOD approval and removes the decided row after reload", async () => {
    api.patch.mockResolvedValue({ unlocked_until: "2026-10-30T10:30:00.000Z" });
    api.get.mockResolvedValueOnce([request]).mockResolvedValueOnce([]);
    render(<HodAttendanceUnlockApprovalsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve limited window" }),
    );
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/api/academics/hod/approvals/attendance-unlocks/request-1",
        { action: "APPROVE", remarks: undefined },
      ),
    );
    expect(
      await screen.findByText("No pending attendance unlock requests."),
    ).toBeTruthy();
  });
});
