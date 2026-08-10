'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AppTopBar } from '@/components/layout/AppTopBar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { useAuth } from '@/context/AuthContext';
import { resolveUserRoleList } from '@/lib/available-workspaces';
import { resolveDofaInboxPathForUser } from '@/lib/dofa-portal-routes';
import { filterPortalConfigForLaunchModules } from '@/lib/launch-modules';
import {
  collectNavHrefs,
  isNavHrefActive,
  resolveActiveNavHref,
  withAccountSettingsNav,
  withRoleAwareDofaInboxNav,
  type PortalConfig,
} from '@/lib/navigation';
import {
  getSidebarCollapsedServerSnapshot,
  getSidebarCollapsedSnapshot,
  subscribeSidebarCollapsed,
  writeSidebarCollapsed,
} from '@/lib/sidebar-ui-state';

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
  const hrefs = collectNavHrefs(config.navGroups);
  const activeHref = resolveActiveNavHref(pathname, hrefs);
  if (!activeHref) return null;
  for (const group of config.navGroups) {
    for (const item of group.items) {
      if (item.href === activeHref) return item;
    }
  }
  return null;
}

export function AppShell({ config, children, profileHref, headerExtra, contentMaxWidthClass }: AppShellProps) {
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getSidebarCollapsedServerSnapshot,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const launchConfig = useMemo(() => {
    const roles = resolveUserRoleList(user);
    const inboxHref = resolveDofaInboxPathForUser(roles, pathname);
    const withDofa = withRoleAwareDofaInboxNav(config, inboxHref);
    return withAccountSettingsNav(filterPortalConfigForLaunchModules(withDofa));
  }, [config, pathname, user]);

  const activeNav = useMemo(() => findActiveNavItem(launchConfig, pathname), [launchConfig, pathname]);
  const isHome = pathname === launchConfig.homeHref;
  const mobileItems = launchConfig.mobileNavItems ?? launchConfig.commandItems.slice(0, 4);
  const mobileHrefs = mobileItems.map((item) => item.href);

  // Close the mobile drawer after route changes (sidebar Link navigation).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebar = (
    <AppSidebar
      personaLabel={launchConfig.personaLabel}
      navGroups={launchConfig.navGroups}
      collapsed={collapsed}
      onToggleCollapse={() => writeSidebarCollapsed(!collapsed)}
      className="h-full"
    />
  );

  return (
    <div className="min-w-0 overflow-x-hidden bg-sgvu-surface">
      <div className="fixed inset-y-0 left-0 z-30 hidden h-svh min-h-0 overflow-hidden lg:block">
        {sidebar}
      </div>

      <div
        className={cn(
          'flex h-svh min-w-0 flex-col overflow-hidden transition-[padding] duration-200',
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

        {/* Below lg the bottom padding clears the fixed mobile nav; at lg+ the wrapper's own
            py already provides ~20px, so only a small extra keeps total trailing space ≈32px. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-3">
          <div className={cn('mx-auto w-full min-w-0 px-3 py-3 sm:px-5 sm:py-5 lg:px-6', contentMaxWidthClass)}>
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
            const active = isNavHrefActive(pathname, item.href, mobileHrefs);
            const label = item.shortLabel ?? item.label;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-semibold touch-target transition-colors',
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
