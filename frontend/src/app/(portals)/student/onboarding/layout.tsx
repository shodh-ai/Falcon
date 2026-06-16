import type { ReactNode } from 'react';
import { FalconLogo } from '@/components/brand/FalconLogo';

export default function StudentOnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sgvu-surface to-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <FalconLogo className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold text-sgvu-navy">Falcon Student Onboarding</p>
            <p className="text-xs text-muted-foreground">Complete setup to unlock your portal</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
