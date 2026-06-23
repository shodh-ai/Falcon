'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AppTopBar } from '@/components/layout/AppTopBar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { filterPortalConfigForLaunchModules } from '@/lib/launch-modules';
import type { PortalConfig } from '@/lib/navigation';

interface AppShellProps {
  config: PortalConfig;
  children: ReactNode;
  profileHref?: string;
  headerExtra?: ReactNode;
  /** Align header and main to the same max width (e.g. max-w-6xl) */
  contentMaxWidthClass?: string;
}

function findActiveNavItem(config: PortalConfig, pathname: string | null) {
  if (!pathname) return null;
  for (const group of config.navGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item;
      }
    }
  }
  return null;
}

export function AppShell({ config, children, profileHref, headerExtra, contentMaxWidthClass }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const launchConfig = useMemo(() => filterPortalConfigForLaunchModules(config), [config]);

  const activeNav = useMemo(() => findActiveNavItem(launchConfig, pathname), [launchConfig, pathname]);
  const isHome = pathname === launchConfig.homeHref;
  const mobileItems = launchConfig.mobileNavItems ?? launchConfig.commandItems.slice(0, 4);

  const sidebar = (
    <AppSidebar
      personaLabel={launchConfig.personaLabel}
      navGroups={launchConfig.navGroups}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((v) => !v)}
      className="h-full"
    />
  );

  return (
    <div className="bg-sgvu-surface">
      <div className="fixed inset-y-0 left-0 z-30 hidden h-svh lg:block">{sidebar}</div>

      <div
        className={cn(
          'flex h-svh flex-col overflow-hidden transition-[padding] duration-200',
          collapsed ? 'lg:pl-[var(--sidebar-width-collapsed)]' : 'lg:pl-[var(--sidebar-width)]',
        )}
      >
        <AppTopBar
          config={launchConfig}
          pageTitle={isHome ? launchConfig.personaTitle : activeNav?.label ?? launchConfig.personaTitle}
          pageShortTitle={isHome ? undefined : activeNav?.shortLabel}
          profileHref={profileHref}
          headerExtra={headerExtra}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-8">
          <div className={cn('mx-auto w-full px-3 py-4 sm:px-6 sm:py-5', contentMaxWidthClass)}>
            {children}
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Quick navigation"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4 gap-0.5 px-1 pt-1">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const label = item.shortLabel ?? item.label;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-semibold touch-target transition-colors',
                    active
                      ? 'bg-sgvu-navy/8 text-sgvu-navy'
                      : 'text-muted-foreground hover:text-sgvu-navy',
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', active && 'text-sgvu-gold')} />
                  <span className="line-clamp-1 max-w-full text-center leading-tight">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
