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

const message = "1 ETE marks submitted to the concerned HOD. Exam Cell must release them later.";
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
  const submit = screen.getByRole("button", { name: "Submit ETE to HOD" });
  await waitFor(() => expect(submit).toBeEnabled());
  return submit;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.get.mockImplementation(async (url: string) => url.includes('examType=ETE')
    ? { result_session: { max_marks: 40, entry_status: 'OPEN', marks_locked: false } }
    : roster());
  api.post.mockImplementation(async (url: string) =>
    url.endsWith("/marks/publish")
      ? {
          published: 1,
          status: "PENDING_COE",
          message,
          notified_count: 0,
        }
      : { saved: 1, status: "DRAFT" },
  );
});
afterEach(cleanup);

describe("faculty bulk submission feedback", () => {
  it("submits ETE to HOD without publishing to students", async () => {
    fireEvent.click(await openCourse());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    expect(api.post).toHaveBeenCalledWith(
      "/api/academics/faculty/workspaces/marks/publish",
      { course_id: "course-a", exam_type: "ETE" },
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
      api.get.mockImplementation(async (url: string) => url.includes('examType=ETE')
        ? { result_session: { max_marks: 40, entry_status: 'OPEN', marks_locked: false } }
        : roster(status));
      render(<FacultyGradingPage />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'course-a' } });
      await screen.findByText('Test Student');
      expect(screen.getByRole('button', { name: 'Submit ETE to HOD' })).toBeDisabled();
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
      api.post.mock.calls.some(([url]) => String(url).endsWith("/marks/publish")),
    ).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
