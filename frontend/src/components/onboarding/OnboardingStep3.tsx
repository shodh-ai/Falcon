'use client';

import { Clock3, Mail, ShieldCheck } from 'lucide-react';
import { OnboardingPanel } from '@/components/onboarding/onboarding-ui';
import type { PortalOnboardingConfig } from '@/lib/onboarding/portal-onboarding';

export function OnboardingStep3({ config }: { config: PortalOnboardingConfig }) {
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
          The university administration is verifying your documents. You&apos;ll receive an email once
          your portal access is approved.
        </p>

        <div className="space-y-3 text-left">
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-sgvu-surface/50 px-4 py-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
            <div>
              <p className="text-sm font-medium text-sgvu-navy">Check your email</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Approval updates are sent to your official university email.
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
