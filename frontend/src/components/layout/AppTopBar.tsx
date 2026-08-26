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
  breadcrumb?: { portal: string; section: string; page: string } | null;
  profileHref?: string;
  headerExtra?: ReactNode;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function AppTopBar({
  config,
  pageTitle,
  pageShortTitle,
  breadcrumb,
  profileHref,
  headerExtra,
  mobileOpen,
  onMobileOpenChange,
}: AppTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-sgvu-gold/30 bg-white shadow-sm">
      <div className="flex h-16 w-full items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-lg border-sgvu-navy/10 lg:hidden"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(100vw,18rem)] p-0"
            onInteractOutside={() => onMobileOpenChange(false)}
          >
            <div className="h-full" onClick={() => onMobileOpenChange(false)}>
              <AppSidebar
                personaLabel={config.personaLabel}
                navGroups={config.navGroups}
                collapsed={false}
                onToggleCollapse={() => {}}
                collapsibleNavGroups={config.collapsibleNavGroups}
                sidebarBrandLabel={config.sidebarBrandLabel}
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          {breadcrumb ? (
            <p className="truncate text-[10px] font-medium text-sgvu-navy/45 sm:text-[11px]">
              <span className="hidden sm:inline">{breadcrumb.portal}</span>
              <span className="hidden sm:inline"> · </span>
              <span>{breadcrumb.section}</span>
              <span aria-hidden> / </span>
              <span className="text-sgvu-navy/70">{breadcrumb.page}</span>
            </p>
          ) : null}
          <h1 className="truncate text-base font-bold tracking-tight text-sgvu-navy sm:text-lg">
            {pageShortTitle ? (
              <>
                <span className="sm:hidden">{pageShortTitle}</span>
                <span className="hidden sm:inline">{pageTitle}</span>
              </>
            ) : (
              pageTitle
            )}
          </h1>
          <p className="truncate text-[11px] font-medium text-sgvu-navy/50">
            {breadcrumb ? 'FALCON' : config.personaLabel}
          </p>
        </div>

        <div
          className="hidden h-9 w-px shrink-0 bg-sgvu-navy/10 sm:block"
          aria-hidden
        />

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {headerExtra}
          <div className="hidden sm:flex">
            <WorkspaceSwitcher />
          </div>
          <UniversalSearchOmnibar navGroups={config.navGroups} />
          <QuickActionMenu />
          <LiveNotificationBell />
          <ProfileMenu profileHref={profileHref} />
        </div>
      </div>
    </header>
  );
}
