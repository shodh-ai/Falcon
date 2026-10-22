import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StaffProfileVerificationsPage from "@/app/(portals)/hr/staff-profile-verifications/page";

const mocks = vi.hoisted(() => ({ get: vi.fn(), getBlob: vi.fn(), post: vi.fn(), user: { role: "HRAdmin", roles: [] as string[] } }));
vi.mock("@/lib/api", () => ({ useAuthedApi: () => mocks }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
const pending = { review_id: "review-1", user_id: "staff-1", name: "Faculty One", official_email: "faculty@example.edu", role_name: "Faculty", dept_id: 43, dept_name: "Pharmacy", status: "PENDING_HR", onboarding_status: "COMPLETED", source: "PHARMACY_RECHECK", revision: 1 };
let row = { ...pending, document_review_status: "NOT_REVIEWED", recovery_required: false };
async function open() {
  render(<StaffProfileVerificationsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Review", exact: true }));
  return within(await screen.findByRole("dialog"));
}
describe("Individual HR profile approval with deferred documents", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.role = "HRAdmin"; row = { ...pending, document_review_status: "NOT_REVIEWED", recovery_required: false };
    mocks.get.mockImplementation((url: string) => Promise.resolve(url.endsWith("/review-1") ? { review: { ...row, return_reason: null }, profile: { qualification: { degree_name: "MPharm" } }, documents: [], events: [] } : [row]));
    mocks.post.mockResolvedValue({ document_review_status: "PENDING", email_status: "QUEUED" });
  });
  it("requires reviewed details, with select-all and clear-all limited to one profile", async () => {
    const d = await open();
    const approve = d.getByRole("button", { name: "Approve details — documents pending" });
    expect(approve).toBeDisabled();
    expect(d.getAllByRole("checkbox")).toHaveLength(23);
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    expect(d.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);
    expect(approve).toBeEnabled();
    fireEvent.click(d.getByRole("checkbox", { name: "Reviewed and correct: Mobile number" }));
    expect(approve).toBeDisabled();
    fireEvent.click(d.getByRole("button", { name: "Clear all details" }));
    expect(d.getAllByRole("checkbox").some((c) => (c as HTMLInputElement).checked)).toBe(false);
  });
  it("does not clear checked details when the current review mode is clicked again", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    fireEvent.click(d.getByRole("button", { name: "Review for approval", exact: true }));
    expect(d.getByRole("button", { name: "Approve details — documents pending" })).toBeEnabled();
    expect(d.getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
  });
  it("does not erase a correction selection or note when its active mode is clicked again", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Request corrections", exact: true }));
    fireEvent.click(d.getByRole("checkbox", { name: "Request correction: Mobile number" }));
    fireEvent.change(d.getByRole("textbox", { name: /Correction note/ }), { target: { value: "Correct the mobile number" } });
    fireEvent.click(d.getByRole("button", { name: "Request corrections", exact: true }));
    expect(d.getByRole("checkbox", { name: "Request correction: Mobile number" })).toBeChecked();
    expect(d.getByRole("textbox", { name: /Correction note/ })).toHaveValue("Correct the mobile number");
    expect(d.getByRole("button", { name: "Request corrections & email" })).toBeEnabled();
  });
  it("explicitly approves details without claiming document verification", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    fireEvent.click(d.getByRole("button", { name: "Approve details — documents pending" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/hr/staff-profile-reviews/review-1/approve", expect.objectContaining({ defer_documents: true, reviewed_fields: expect.arrayContaining(["staff_mobile", "degree_name"]), deferral_reason: expect.any(String) })));
    expect(mocks.post.mock.calls[0][1].reviewed_fields).toHaveLength(23);
    expect(await screen.findByRole("status")).toHaveTextContent(/Document verification remains pending/i);
  });
  it("requires both details and documents for recovery and sends the current revision", async () => {
    row.recovery_required = true;
    const d = await open();
    const approve = d.getByRole("button", { name: "Approve profile and documents" });
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    expect(approve).toBeDisabled();
    fireEvent.click(d.getByRole("button", { name: "Select all inspected documents" }));
    expect(approve).toBeEnabled(); fireEvent.click(approve);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/hr/staff-profile-reviews/review-1/approve", expect.objectContaining({ defer_documents: false, revision: 1, reviewed_documents: ["PHOTO", "AADHAAR", "PAN", "HIGHEST_DEGREE"] })));
    expect(await screen.findByRole("status")).toHaveTextContent('profile and documents are approved');
  });
  it("separates correction selection from approval and supports bulk selection/clearing", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    fireEvent.click(d.getByRole("button", { name: "Request corrections", exact: true }));
    expect(d.queryByRole("button", { name: "Approve details — documents pending" })).not.toBeInTheDocument();
    fireEvent.click(d.getByRole("button", { name: "Select all correction fields" }));
    fireEvent.click(d.getByRole("button", { name: "Select all replacement requests" }));
    expect(d.getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked)).toHaveLength(27);
    fireEvent.click(d.getByRole("button", { name: "Clear all details" }));
    fireEvent.click(d.getByRole("button", { name: "Clear all documents" }));
    fireEvent.click(d.getByRole("checkbox", { name: "Request correction: Mobile number" }));
    fireEvent.change(d.getByRole("textbox", { name: /Correction note/ }), { target: { value: "Please correct your mobile number." } });
    fireEvent.click(d.getByRole("button", { name: "Request corrections & email" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/hr/staff-profile-reviews/review-1/return", { fields: ["staff_mobile"], documents: [], reason: "Please correct your mobile number." }));
    expect(await screen.findByRole("status")).toHaveTextContent(/email has been queued/i);
  });
  it("retains the profile and exposes failed approval without claiming success", async () => {
    mocks.post.mockRejectedValue(new Error("Review is no longer pending"));
    const d = await open(); fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    fireEvent.click(d.getByRole("button", { name: "Approve details — documents pending" }));
    expect(await d.findByRole("alert")).toHaveTextContent("Review is no longer pending");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("refreshes a stale review before posting and never submits the outdated approval", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    row = { ...row, status: "RETURNED_FOR_CORRECTION", revision: 2, recovery_required: true };
    fireEvent.click(d.getByRole("button", { name: "Approve details — documents pending" }));
    expect(await d.findByRole("alert")).toHaveTextContent("This review has changed");
    expect(d.getByText(/Waiting for the faculty member to complete and resubmit/)).toBeInTheDocument();
    expect(d.queryByRole("button", { name: /Approve profile|Approve details/ })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("retains checkboxes across an unchanged manual refresh", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    fireEvent.click(d.getByRole("button", { name: "Refresh this review" }));
    await waitFor(() => expect(d.getByRole("button", { name: "Refresh this review" })).toBeEnabled());
    expect(d.getByRole("button", { name: "Approve details — documents pending" })).toBeEnabled();
    expect(d.getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
  });
  it("clears old attestations when the faculty submission revision changes", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    row = { ...row, revision: 2 };
    fireEvent.click(d.getByRole("button", { name: "Refresh this review" }));
    expect(await d.findByRole("alert")).toHaveTextContent("old selections have been cleared");
    expect(d.getByRole("button", { name: "Approve details — documents pending" })).toBeDisabled();
    expect(d.getAllByRole("checkbox").some(c => (c as HTMLInputElement).checked)).toBe(false);
    expect(d.getByText(/Complete these checks to enable approval/)).toBeInTheDocument();
  });
  it("preserves work and does not post a decision if its freshness check fails", async () => {
    const d = await open();
    fireEvent.click(d.getByRole("button", { name: "Select all details" }));
    mocks.get.mockRejectedValueOnce(new Error("Cannot refresh the current review"));
    fireEvent.click(d.getByRole("button", { name: "Approve details — documents pending" }));
    expect(await d.findByRole("alert")).toHaveTextContent("Cannot refresh");
    expect(d.getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("keeps deferred documents in a separate queue and rejects unavailable originals", async () => {
    row = { ...pending, status: "APPROVED", document_review_status: "PENDING", recovery_required: false };
    mocks.post.mockRejectedValue(new Error("Cannot verify PHOTO: original document is missing or unreadable"));
    render(<StaffProfileVerificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Documents pending/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Review documents", exact: true }));
    const d = within(await screen.findByRole("dialog"));
    const verify = d.getByRole("button", { name: "Verify inspected documents" });
    expect(verify).toBeDisabled();
    fireEvent.click(d.getByRole("button", { name: "Select all inspected documents" }));
    expect(verify).toBeEnabled(); fireEvent.click(verify);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/hr/staff-profile-reviews/review-1/verify-documents", { reviewed_documents: ["PHOTO", "AADHAAR", "PAN", "HIGHEST_DEGREE"] }));
    expect(await d.findByRole("alert")).toHaveTextContent(/original document is missing/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it.each(["CampusAdmin", "SuperAdmin", "HR"])("keeps %s read-only", async (role) => {
    mocks.user.role = role; render(<StaffProfileVerificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "View", exact: true }));
    const d = within(await screen.findByRole("dialog"));
    expect(d.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(d.queryByRole("button", { name: "Approve details — documents pending" })).not.toBeInTheDocument();
  });
});
