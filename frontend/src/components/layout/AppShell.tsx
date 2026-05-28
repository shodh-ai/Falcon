'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { CommandMenu } from '@/components/layout/CommandMenu';
import { NotificationBell, type AppNotification } from '@/components/layout/NotificationBell';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { AppSidebar } from '@/components/layout/AppSidebar';
import type { PortalConfig } from '@/lib/navigation';

interface AppShellProps {
  config: PortalConfig;
  children: ReactNode;
  notifications?: AppNotification[];
  profileHref?: string;
}

export function AppShell({ config, children, notifications = [], profileHref }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <AppSidebar
      personaLabel={config.personaLabel}
      navGroups={config.navGroups}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((v) => !v)}
      className="h-full"
    />
  );

  return (
    <div className="min-h-screen bg-sgvu-surface">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>

      {/* Main column */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200',
          collapsed ? 'lg:pl-[var(--sidebar-width-collapsed)]' : 'lg:pl-[var(--sidebar-width)]',
        )}
      >
        <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden shrink-0">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0" onInteractOutside={() => setMobileOpen(false)}>
                <div className="h-full" onClick={() => setMobileOpen(false)}>
                  <AppSidebar
                    personaLabel={config.personaLabel}
                    navGroups={config.navGroups}
                    collapsed={false}
                    onToggleCollapse={() => {}}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <div className="hidden min-w-0 sm:block">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sgvu-gold">{config.personaLabel}</p>
              <h1 className="truncate text-base font-semibold text-sgvu-navy sm:text-lg">{config.personaTitle}</h1>
            </div>

            <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:gap-3 md:max-w-xl md:flex-initial">
              <div className="hidden flex-1 md:block">
                <CommandMenu items={config.commandItems} />
              </div>
              <NotificationBell notifications={notifications} />
              <ProfileMenu profileHref={profileHref ?? config.homeHref.replace('/dashboard', '/profile')} />
            </div>
          </div>
          <div className="border-t border-border/60 px-4 pb-3 md:hidden">
            <CommandMenu items={config.commandItems} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}
