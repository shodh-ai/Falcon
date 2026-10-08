'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { OnboardingPanel } from '@/components/onboarding/onboarding-ui';
import type { PortalOnboardingConfig } from '@/lib/onboarding/portal-onboarding';
import {
  getOnboardingStepPath,
  isFirstLoginOnboardingComplete,
} from '@/lib/onboarding/portal-onboarding';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

export function OnboardingStep3({ config }: { config: PortalOnboardingConfig }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const fresh = await refreshUser().catch(() => null);
      if (cancelled || !fresh) return;

      if (isFirstLoginOnboardingComplete(fresh.onboarding_status, fresh.primaryRole ?? fresh.role)) {
        router.replace(config.dashboardPath);
        return;
      }

      const nextPath = getOnboardingStepPath(
        config.portalPrefix,
        fresh.onboarding_status,
        fresh.primaryRole ?? fresh.role,
      );
      if (nextPath && nextPath !== `${config.portalPrefix}/onboarding/step-3`) {
        router.replace(nextPath);
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [config.dashboardPath, config.portalPrefix, refreshUser, router]);

  return (
    <OnboardingPanel
      icon={Clock3}
      title="You're in the waiting room"
      description="Your profile has been submitted and is under review."
    >
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200/80">
          <Clock3 className="h-10 w-10 text-amber-600" />
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          The university administration is verifying your documents. This page refreshes automatically
          every 15 seconds — you&apos;ll be redirected when access is approved.
        </p>

        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => void refreshUser()}
        >
          <RefreshCw className="h-4 w-4" />
          Check status now
        </Button>

        <div className="space-y-3 text-left">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-sgvu-surface/50 px-4 py-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
            <div>
              <p className="text-sm font-medium text-sgvu-navy">Check your email</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Approval updates are sent to {user?.email ?? 'your official university email'}.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-sgvu-surface/50 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
            <div>
              <p className="text-sm font-medium text-sgvu-navy">Dashboard locked</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The {config.portalLabel.toLowerCase()} dashboard unlocks automatically after verification.
              </p>
            </div>
          </div>
        </div>
      </div>
    </OnboardingPanel>
  );
}
