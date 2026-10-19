import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FacultyGradingPage from "@/app/(portals)/faculty/grading/page";

const { api, toast, courses } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  courses: [
    { course_id: "course-a", course_code: "CS101", course_name: "Algorithms" },
  ],
}));
vi.mock("@/lib/api", () => ({ useAuthedApi: () => api }));
vi.mock("@/components/faculty/useFacultyCourses", () => ({
  useFacultyCourses: () => ({ courses, loading: false }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
}));
vi.mock("@/lib/notifications/falcon-toast", () => ({ toast }));
vi.mock("@/lib/faculty-demo-mode", () => ({
  isFacultyDemoEntityId: () => false,
  isEmptyArray: (data: unknown[]) => data.length === 0,
  withFacultyDemoFallback: (data: unknown) => data,
}));
vi.mock("@/components/faculty", () => ({
  FacultyPageShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  FacultyPanel: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  FacultyPageHeader: () => null,
  FacultyEmptyState: () => null,
  FacultyErrorBanner: () => null,
  FacultyMetricChip: () => null,
  FacultyInlineLoading: () => null,
}));

const message =
  "Submitted 1 exam marks to Exam Cell. Results require Dean approval and Exam Cell publication.";
const roster = (status = "DRAFT") => [
  {
    student_user_id: "student-a",
    name: "Test Student",
    roll_number: "TEST-1",
    marks: { ETE: { obtained: 32, status } },
  },
];
async function openCourse() {
  render(<FacultyGradingPage />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "course-a" },
  });
  await screen.findByText("Test Student");
  return screen.getByRole("button", { name: "Submit All Marks" });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.get.mockResolvedValue(roster());
  api.post.mockImplementation(async (url: string) =>
    url.endsWith("/publish-all")
      ? {
          published: 0,
          submitted: 1,
          status: "PENDING_COE",
          message,
          notified_count: 0,
        }
      : { saved: 1, status: "DRAFT" },
  );
});
afterEach(cleanup);

describe("faculty bulk submission feedback", () => {
  it("submits through the existing endpoint and says awaiting approval, not published", async () => {
    fireEvent.click(await openCourse());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    expect(api.post).toHaveBeenCalledWith(
      "/api/academics/faculty/workspaces/course/course-a/publish-all",
    );
    expect(toast.warning).not.toHaveBeenCalled();
    expect(
      toast.success.mock.calls.some(([text]) =>
        String(text).startsWith("Published"),
      ),
    ).toBe(false);
  });

  it.each(["PENDING_COE", "PUBLISHED"])(
    "does not offer resubmission of %s marks",
    async (status) => {
      api.get.mockResolvedValue(roster(status));
      expect(await openCourse()).toBeDisabled();
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it("does not submit stale drafts after saving fails", async () => {
    api.post.mockRejectedValue(new Error("Marks entry is locked"));
    fireEvent.click(await openCourse());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Marks entry is locked"),
    );
    expect(
      api.post.mock.calls.some(([url]) => String(url).endsWith("/publish-all")),
    ).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
