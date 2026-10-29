"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useModuleRuntime } from "@/context/ModuleRuntimeContext";
import { resolveUserRoleList } from "@/lib/available-workspaces";
import { runtimeModuleForPath } from "@/lib/launch-modules";

export function PrincipalWorkspaceReturn() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { manifest } = useModuleRuntime();
  const hasOffice = resolveUserRoleList(user).some(
    (role) => role.toLowerCase() === "principal",
  );
  const module = runtimeModuleForPath(manifest, "/principal/dashboard");
  if (
    !hasOffice ||
    pathname === "/principal" ||
    pathname.startsWith("/principal/") ||
    module?.available === false
  )
    return null;

  return (
    <nav
      aria-label="Return to department workspace"
      className="mb-4 rounded-xl border border-sgvu-gold/40 bg-white px-4 py-3"
    >
      <Link
        href="/principal/dashboard"
        className="inline-flex min-h-10 items-center gap-2 font-semibold text-sgvu-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Principal workspace
      </Link>
      <p className="text-sm text-muted-foreground">
        Department overview, staff, students and reporting approvals.
      </p>
    </nav>
  );
}
