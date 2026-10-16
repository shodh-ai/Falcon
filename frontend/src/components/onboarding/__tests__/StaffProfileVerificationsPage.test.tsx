import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StaffProfileVerificationsPage from "@/app/(portals)/hr/staff-profile-verifications/page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getBlob: vi.fn(),
  post: vi.fn(),
  user: { role: "HRAdmin", roles: [] as string[] },
}));
vi.mock("@/lib/api", () => ({ useAuthedApi: () => mocks }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

const pending = {
  review_id: "review-1",
  user_id: "staff-1",
  name: "Faculty One",
  official_email: "faculty@example.edu",
  role_name: "Faculty",
  dept_id: 43,
  dept_name: "Pharmacy",
  status: "PENDING_HR",
  onboarding_status: "COMPLETED",
  source: "PHARMACY_RECHECK",
};
const detail = {
  review: { ...pending, return_reason: null },
  profile: { qualification: { degree_name: "MPharm" } },
  documents: [],
  events: [],
};

describe("Individual HR staff verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.role = "HRAdmin";
    mocks.get.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/review-1")
          ? detail
          : [
              pending,
              {
                ...pending,
                review_id: "review-2",
                user_id: "staff-2",
                name: "Approved Faculty",
                status: "APPROVED",
              },
            ],
      ),
    );
    mocks.post.mockResolvedValue({
      status: "RETURNED_FOR_CORRECTION",
      email_status: "QUEUED",
    });
  });

  it("opens one profile from the pending table without batch or backup setup", async () => {
    render(<StaffProfileVerificationsPage />);
    await screen.findByText("Faculty One");
    expect(screen.queryByText("Approved Faculty")).not.toBeInTheDocument();
    expect(
      screen.queryByText("One-time Pharmacy HR recheck"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/backup reference/i)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review", exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("MPharm")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Approve profile" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole("button", {
        name: "Request corrections & email",
      }),
    ).toBeDisabled();
  });

  it("requests a correction for a missing field and reports the email as queued", async () => {
    render(<StaffProfileVerificationsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review", exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Request correction: Mobile number",
      }),
    );
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: /Correction note/ }),
      { target: { value: "Please enter your current mobile number." } },
    );
    expect(
      within(dialog).getByRole("button", { name: "Approve profile" }),
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Request corrections & email",
      }),
    );
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/api/hr/staff-profile-reviews/review-1/return",
        {
          reason: "Please enter your current mobile number.",
          fields: ["staff_mobile"],
          documents: [],
        },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "An email has been queued to faculty@example.edu",
    );
  });

  it("keeps the individual profile open and reports a failed decision without claiming an email", async () => {
    mocks.post.mockRejectedValue(new Error("Review is no longer pending"));
    render(<StaffProfileVerificationsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review", exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve profile" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Review is no longer pending",
      ),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["CampusAdmin", "SuperAdmin", "HR"])(
    "keeps %s read-only",
    async (role) => {
      mocks.user.role = role;
      render(<StaffProfileVerificationsPage />);
      fireEvent.click(
        await screen.findByRole("button", { name: "View", exact: true }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).queryByRole("button", { name: "Approve profile" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", {
          name: "Request corrections & email",
        }),
      ).not.toBeInTheDocument();
    },
  );
});
