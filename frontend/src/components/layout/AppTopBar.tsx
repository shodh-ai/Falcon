'use client';

import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { UniversalSearchOmnibar } from '@/components/layout/UniversalSearchOmnibar';
import { LiveNotificationBell } from '@/components/layout/LiveNotificationBell';
import { QuickActionMenu } from '@/components/layout/QuickActionMenu';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import type { PortalConfig } from '@/lib/navigation';

interface AppTopBarProps {
  config: PortalConfig;
  pageTitle: string;
  pageShortTitle?: string;
  profileHref?: string;
  headerExtra?: ReactNode;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function AppTopBar({
  config,
  pageTitle,
  pageShortTitle,
  profileHref,
  headerExtra,
  mobileOpen,
  onMobileOpenChange,
}: AppTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-sgvu-gold/30 bg-white shadow-sm">
      <div className="flex h-14 w-full min-w-0 items-center gap-1.5 px-2.5 sm:h-16 sm:gap-3 sm:px-6">
        <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-lg border-sgvu-navy/10 lg:hidden"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex h-svh w-[min(100vw,18rem)] max-w-[85vw] flex-col overflow-hidden p-0"
            onInteractOutside={() => onMobileOpenChange(false)}
          >
            <div className="min-h-0 flex-1" onClick={() => onMobileOpenChange(false)}>
              <AppSidebar
                personaLabel={config.personaLabel}
                navGroups={config.navGroups}
                collapsed={false}
                onToggleCollapse={() => {}}
                className="h-full w-full max-w-none"
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold tracking-tight text-sgvu-navy sm:text-base md:text-lg">
            {pageShortTitle ? (
              <>
                <span className="sm:hidden">{pageShortTitle}</span>
                <span className="hidden sm:inline">{pageTitle}</span>
              </>
            ) : (
              pageTitle
            )}
          </h1>
          <p className="hidden truncate text-[11px] font-medium text-sgvu-navy/50 sm:block">
            {config.personaLabel}
          </p>
        </div>

        <div
          className="hidden h-9 w-px shrink-0 bg-sgvu-navy/10 md:block"
          aria-hidden
        />

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {headerExtra}
          {!config.hideWorkspaceSwitcher && <WorkspaceSwitcher />}
          <UniversalSearchOmnibar navGroups={config.navGroups} />
          <QuickActionMenu />
          <LiveNotificationBell />
          <ProfileMenu profileHref={profileHref} />
        </div>
      </div>
    </header>
  );
}
