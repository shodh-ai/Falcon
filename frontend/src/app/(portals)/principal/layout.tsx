"use client";
import type { ReactNode } from "react";
import { RoleGate } from "@/components/layout/RoleGate";
import { AppShell } from "@/components/layout/AppShell";
import { StaffProfileFreezeGate } from "@/components/onboarding/StaffProfileFreezeGate";
import { principalPortal } from "@/lib/principal-navigation";
import { PortalOnboardingGuard } from "@/components/onboarding/PortalOnboardingGuard";
import { PRINCIPAL_ONBOARDING_CONFIG } from "@/lib/onboarding/portal-onboarding";
import { usePathname } from "next/navigation";
export default function PrincipalLayout({ children }: { children: ReactNode }) {
  const onboarding = usePathname().startsWith("/principal/onboarding");
  return (
    <RoleGate>
      <PortalOnboardingGuard config={PRINCIPAL_ONBOARDING_CONFIG}>
        {onboarding ? (
          children
        ) : (
          <StaffProfileFreezeGate>
            <AppShell config={principalPortal}>{children}</AppShell>
          </StaffProfileFreezeGate>
        )}
      </PortalOnboardingGuard>
    </RoleGate>
  );
}
