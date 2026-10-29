"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { hodPortal } from "@/lib/navigation";
import { useAuthedApi } from "@/lib/api";
export function HodShell({ children }: { children: ReactNode }) {
  const api = useAuthedApi();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .get<{ enabled: boolean }>(
        "/api/academics/department-oversight/hod/availability",
      )
      .then((d) => {
        if (active) setEnabled(d.enabled);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const config = enabled
    ? hodPortal
    : {
        ...hodPortal,
        navGroups: hodPortal.navGroups.map((g) => ({
          ...g,
          items: g.items.filter(
            (i) => i.href !== "/hod/approvals/department-oversight",
          ),
        })),
        commandItems: hodPortal.commandItems.filter(
          (i) => i.href !== "/hod/approvals/department-oversight",
        ),
      };
  return <AppShell config={config}>{children}</AppShell>;
}
