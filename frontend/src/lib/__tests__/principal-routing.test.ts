import { describe, it, expect } from "vitest";
import {
  canRoleAccessPath,
  getDashboardPathForRole,
  getWorkspaceLabelForRole,
} from "../auth-routing";
import { getOnboardingConfigForRole } from "../onboarding/portal-onboarding";
describe("Principal workspace routing", () => {
  it("routes to a separate named Principal workspace", () => {
    expect(getDashboardPathForRole("Principal")).toBe("/principal/dashboard");
    expect(getWorkspaceLabelForRole("Principal")).toBe("Principal Workspace");
  });
  it("does not admit HOD/Faculty to Principal portal", () => {
    expect(canRoleAccessPath(["HOD", "Faculty"], "/principal/dashboard")).toBe(
      false,
    );
    expect(canRoleAccessPath(["Principal"], "/principal/dashboard")).toBe(true);
  });
  it("does not grant HOD academic mutation paths merely by being Principal", () => {
    expect(canRoleAccessPath(["Principal"], "/hod/faculty/workload")).toBe(
      false,
    );
  });
  it("retains first login onboarding rather than bypassing it", () => {
    expect(getOnboardingConfigForRole("Principal")?.portalPrefix).toBe(
      "/principal",
    );
  });
});
