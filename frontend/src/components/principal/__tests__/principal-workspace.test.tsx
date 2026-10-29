import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrincipalReportingRequests } from "../PrincipalReportingRequests";
import { DepartmentCasesPanel } from "../DepartmentCasesPanel";
import { PrincipalOversightPage, duration } from "../PrincipalOversightPage";
import { PrincipalWorkspaceReturn } from "@/components/layout/PrincipalWorkspaceReturn";
import { principalPortal } from "@/lib/principal-navigation";
import { resolveDofaInboxPathForUser } from "@/lib/dofa-portal-routes";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  pathname: "/faculty/dashboard",
  user: { roles: ["Principal", "Faculty"] },
  manifest: null,
}));
const api = { get: mocks.get, post: mocks.post, patch: mocks.patch };
vi.mock("@/lib/api", () => ({ useAuthedApi: () => api }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/context/ModuleRuntimeContext", () => ({
  useModuleRuntime: () => ({ manifest: mocks.manifest }),
}));
const row = {
  case_id: "11111111-1111-4111-8111-111111111111",
  kind: "TIMETABLE",
  title: "Review timetable exception",
  reason: "HOD recommendation and supporting reason",
  status: "PENDING_PRINCIPAL",
  revision: 1,
  updated_at: "2026-10-29T10:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.pathname = "/faculty/dashboard";
  mocks.user = { roles: ["Principal", "Faculty"] };
  mocks.get.mockImplementation(async (path: string) =>
    path.endsWith(row.case_id)
      ? { sessions: [], history: [] }
      : path.endsWith("/cases")
        ? { cases: [row] }
        : [],
  );
});
afterEach(cleanup);
describe("Principal workspace boundaries", () => {
  it("keeps every navigation item in Principal and maps DoFA to the scoped queue", () => {
    for (const item of principalPortal.commandItems)
      expect(item.href.startsWith("/principal/")).toBe(true);
    expect(
      resolveDofaInboxPathForUser(
        ["Principal", "Faculty"],
        "/principal/dashboard",
      ),
    ).toBe("/principal/inbox");
    expect(
      resolveDofaInboxPathForUser(["Principal"], "/principal/dashboard"),
    ).toBe("/principal/inbox");
    expect(resolveDofaInboxPathForUser(["Faculty"], "/faculty/dashboard")).toBe(
      "/faculty/approvals/dofa-inbox",
    );
  });
  it("offers an explicit return after switching to a personal workspace", () => {
    const { rerender } = render(<PrincipalWorkspaceReturn />);
    expect(
      screen.getByRole("link", { name: /Back to Principal/ }),
    ).toHaveAttribute("href", "/principal/dashboard");
    mocks.pathname = "/principal/dashboard";
    rerender(<PrincipalWorkspaceReturn />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("represents load as exact minutes without rounding to decimal hours", () => {
    expect(duration(690)).toBe("11h 30m");
    expect(duration(700)).toBe("11h 40m");
  });
  it("does not invent a successful empty dashboard when its request fails", async () => {
    mocks.get.mockRejectedValue(new Error("Department scope unavailable"));
    render(<PrincipalOversightPage view="dashboard" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Department scope unavailable",
    );
    expect(screen.queryByText("Pending my decision")).not.toBeInTheDocument();
  });
  it("does not count HOD-owned follow-ups in Pending my decision", async () => {
    mocks.get.mockResolvedValue({
      office: { dept_id: 43, login_alias: "principal@example.edu" },
      academic_year: "2026-2027",
      workload: [],
      timetable: [],
      attendance: [],
      audit: [],
      cases: [
        row,
        { ...row, case_id: "two", kind: "FOLLOW_UP", status: "PENDING_HOD" },
      ],
    });
    render(<PrincipalOversightPage view="dashboard" />);
    const card = await screen.findByRole("link", {
      name: /Pending my decision/,
    });
    expect(within(card).getByText("1")).toBeInTheDocument();
  });
});
describe("reserved approval interface", () => {
  it("saves the decision with a revision and idempotency key, then reloads authoritative status", async () => {
    mocks.patch.mockImplementation(async () => {
      mocks.get.mockImplementation(async (path: string) =>
        path.endsWith(row.case_id)
          ? { sessions: [], history: [] }
          : { cases: [{ ...row, status: "APPLIED", revision: 3 }] },
      );
    });
    render(<DepartmentCasesPanel />);
    const button = await screen.findByRole("button", { name: "approve" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision / response (required)"), {
      target: { value: "Approved after reviewing department evidence" },
    });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    const call = mocks.patch.mock.calls[0];
    expect(call[0]).toContain(row.case_id);
    expect(call[1].action).toBe("APPROVE");
    expect(call[2]["If-Match"]).toBe("1");
    expect(call[2]["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("applied")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "approve" }),
    ).not.toBeInTheDocument();
  });
  it("shows the application error and offers retry rather than calling it complete", async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path.endsWith(row.case_id)
        ? { sessions: [], history: [] }
        : {
            cases: [
              {
                ...row,
                status: "APPLICATION_FAILED",
                decision: "APPROVE",
                application_error: "Faculty is on approved leave",
              },
            ],
          },
    );
    render(<DepartmentCasesPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The official timetable has not been changed",
    );
    expect(
      screen.getByRole("button", { name: "Retry application" }),
    ).toBeDisabled();
  });
  it("does not give HOD a Principal decision button", async () => {
    render(<DepartmentCasesPanel role="hod" />);
    await screen.findByText(row.title);
    expect(
      screen.queryByRole("button", { name: "approve" }),
    ).not.toBeInTheDocument();
  });
  it("retains the note and displays a rejected API command instead of hiding it", async () => {
    mocks.patch.mockRejectedValue(
      new Error("Case changed; refresh before deciding"),
    );
    render(<DepartmentCasesPanel />);
    await screen.findByText(row.title);
    fireEvent.change(screen.getByLabelText("Decision / response (required)"), {
      target: { value: "Decision with adequate evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Case changed");
    expect(screen.getByLabelText("Decision / response (required)")).toHaveValue(
      "Decision with adequate evidence",
    );
  });
});

describe("Principal reporting queue", () => {
  it("uses assigned direct reporting requests and offers no specialist or cross-workspace shortcuts", async () => {
    mocks.get.mockResolvedValue({ items: [] });
    render(<PrincipalReportingRequests />);
    await screen.findByText("No assigned pending requests of this type.");
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/hr/ess/team/requests?scope=direct&tab=LEAVE",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Appraisals" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Documents" }),
    ).not.toBeInTheDocument();
  });
  it("surfaces request failures without presenting demo requests", async () => {
    mocks.get.mockRejectedValue(new Error("Reporting scope unavailable"));
    render(<PrincipalReportingRequests />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reporting scope unavailable",
    );
    expect(
      screen.queryByText("No assigned pending requests of this type."),
    ).not.toBeInTheDocument();
  });
});
