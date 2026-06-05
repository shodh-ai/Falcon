'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { CommandMenu } from '@/components/layout/CommandMenu';
import { LiveNotificationBell } from '@/components/layout/LiveNotificationBell';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import type { PortalConfig } from '@/lib/navigation';

interface AppShellProps {
  config: PortalConfig;
  children: ReactNode;
  profileHref?: string;
  headerExtra?: ReactNode;
}

export function AppShell({ config, children, profileHref, headerExtra }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const mobileItems = config.commandItems.slice(0, 4);

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
              <p className="text-[10px] font-bold uppercase tracking-widest text-sgvu-gold">Falcon</p>
              <h1 className="truncate text-base font-black text-sgvu-navy sm:text-lg">{config.personaTitle}</h1>
              <p className="truncate text-[11px] font-medium text-muted-foreground">{config.personaLabel}</p>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="hidden md:block">
                <CommandMenu items={config.commandItems} />
              </div>
              {headerExtra}
              <WorkspaceSwitcher />
              <LiveNotificationBell />
              <ProfileMenu profileHref={profileHref ?? config.homeHref.replace('/dashboard', '/profile')} />
            </div>
          </div>
          <div className="border-t border-border/60 px-4 pb-3 md:hidden">
            <CommandMenu items={config.commandItems} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium touch-target',
                    active ? 'text-sgvu-navy' : 'text-muted-foreground',
                  )}
                >
                  <Icon className={cn('h-5 w-5', active && 'text-sgvu-gold')} />
                  <span className="line-clamp-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
