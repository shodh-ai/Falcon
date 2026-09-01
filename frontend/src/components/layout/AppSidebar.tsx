'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FalconLogo } from '@/components/brand/FalconLogo';
import type { NavGroup } from '@/lib/navigation';
import { collectNavHrefs, isNavHrefActive } from '@/lib/navigation';
import { readSidebarScroll, writeSidebarScroll } from '@/lib/sidebar-ui-state';

interface AppSidebarProps {
  personaLabel: string;
  navGroups: NavGroup[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
  collapsibleNavGroups?: boolean;
  sidebarBrandLabel?: string;
}

function storageKeyForGroups(personaLabel: string) {
  return `falcon.sidebar.groups.${personaLabel.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

function scrollStorageKey(personaLabel: string) {
  return `falcon.sidebar.scroll.${personaLabel.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

function getSidebarViewport(root: HTMLElement | null) {
  return root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
}

export function AppSidebar({
  personaLabel,
  navGroups,
  collapsed,
  onToggleCollapse,
  className,
  collapsibleNavGroups = false,
  sidebarBrandLabel = 'SGVU Workspace',
}: AppSidebarProps) {
  const pathname = usePathname();
  const allHrefs = collectNavHrefs(navGroups);
  const isExecutivePortal = personaLabel === 'President / VC';
  const storageKey = storageKeyForGroups(personaLabel);
  const scrollKey = scrollStorageKey(personaLabel);
  const asideRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  const defaultExpanded = useMemo(
    () => Object.fromEntries(navGroups.map((group) => [group.title, true])),
    [navGroups],
  );

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(defaultExpanded);

  const persistScroll = useCallback(() => {
    const viewport = getSidebarViewport(asideRef.current);
    if (!viewport) return;
    try {
      window.sessionStorage.setItem(scrollKey, String(viewport.scrollTop));
    } catch {
      // ignore quota / private mode
    }
  }, [scrollKey]);

  const restoreScroll = useCallback(() => {
    const viewport = getSidebarViewport(asideRef.current);
    if (!viewport) return;
    try {
      const raw = window.sessionStorage.getItem(scrollKey);
      if (raw == null) return;
      const top = Number(raw);
      if (!Number.isFinite(top)) return;
      viewport.scrollTop = top;
    } catch {
      // ignore
    }
  }, [scrollKey]);

  useEffect(() => {
    if (!collapsibleNavGroups || collapsed) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setExpandedGroups(defaultExpanded);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setExpandedGroups({ ...defaultExpanded, ...parsed });
    } catch {
      setExpandedGroups(defaultExpanded);
    }
  }, [collapsibleNavGroups, collapsed, defaultExpanded, storageKey]);

  useEffect(() => {
    if (!collapsibleNavGroups || collapsed) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(expandedGroups));
    } catch {
      // ignore quota / private mode
    }
  }, [collapsibleNavGroups, collapsed, expandedGroups, storageKey]);

  // Native overflow scroll persistence (President / VC and other long sidebars).
  useEffect(() => {
    if (collapsibleNavGroups) return;
    const el = navRef.current;
    if (!el) return;
    el.scrollTop = readSidebarScroll();
  }, [collapsed, collapsibleNavGroups]);

  useEffect(() => {
    if (collapsibleNavGroups) return;
    const el = navRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => writeSidebarScroll(el.scrollTop));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
    };
  }, [collapsibleNavGroups]);

  // Registrar / collapsible groups: keep scroll fixed across route changes.
  useLayoutEffect(() => {
    if (!collapsibleNavGroups) return;
    restoreScroll();
    const viewport = getSidebarViewport(asideRef.current);
    if (!viewport) return;

    const onScroll = () => persistScroll();
    viewport.addEventListener('scroll', onScroll, { passive: true });

    const raf = window.requestAnimationFrame(() => restoreScroll());
    const t = window.setTimeout(() => restoreScroll(), 50);

    return () => {
      viewport.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [collapsibleNavGroups, pathname, persistScroll, restoreScroll]);

  const toggleGroup = (title: string) => {
    setExpandedGroups((current) => ({ ...current, [title]: !current[title] }));
  };

  const renderNavLink = (
    item: NavGroup['items'][number],
    options?: { executive?: boolean; persistOnNavigate?: boolean },
  ) => {
    const Icon = item.icon;
    const active = isNavHrefActive(pathname, item.href, allHrefs);
    const executive = options?.executive ?? false;
    const persistOnNavigate = options?.persistOnNavigate ?? false;

    return (
      <Link
        href={item.href}
        scroll={persistOnNavigate ? false : undefined}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed && persistOnNavigate ? item.label : undefined}
        onMouseDown={
          persistOnNavigate
            ? (e) => {
                persistScroll();
                if (e.button === 0) e.preventDefault();
              }
            : undefined
        }
        onClick={
          persistOnNavigate
            ? (e) => {
                persistScroll();
                e.currentTarget.focus({ preventScroll: true });
              }
            : undefined
        }
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition touch-target',
          executive &&
            'min-h-11 rounded-2xl px-3.5 py-2.5 font-semibold transition-all duration-200 ease-out',
          active
            ? 'bg-sgvu-gold text-sgvu-navy shadow-md'
            : cn(
                'text-blue-100 hover:bg-white/10 hover:text-white',
                executive && 'text-blue-100/85 hover:translate-x-0.5 hover:bg-white/8',
              ),
          collapsed && 'justify-center px-2',
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5 shrink-0',
            executive && 'text-white/90 transition-colors',
            active && executive && 'text-white',
          )}
          strokeWidth={executive ? 1.9 : 2}
        />
        {!collapsed && (
          <span
            className={cn(
              persistOnNavigate ? 'truncate' : 'min-w-0 flex-1 whitespace-normal break-words leading-snug',
              executive && 'tracking-[0.005em]',
            )}
          >
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  const collapsibleNav = (
    <ScrollArea className="min-h-0 flex-1 px-2 py-4 [&_[data-radix-scroll-area-thumb]]:bg-white/20 [&_[data-radix-scroll-area-thumb]:hover]:bg-white/30">
      <nav className="space-y-4" aria-label="Workspace modules">
        {navGroups.map((group) => {
          const groupExpanded =
            collapsed || !collapsibleNavGroups || expandedGroups[group.title] !== false;
          const groupHasActive = group.items.some((item) =>
            isNavHrefActive(pathname, item.href, allHrefs),
          );

          return (
            <div key={group.title}>
              {!collapsed && collapsibleNavGroups ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className={cn(
                    'mb-2 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest transition-colors',
                    groupHasActive ? 'text-sgvu-gold' : 'text-sgvu-gold/80 hover:text-sgvu-gold',
                  )}
                  aria-expanded={groupExpanded}
                >
                  <span className="truncate">{group.title}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform',
                      groupExpanded ? 'rotate-0' : '-rotate-90',
                    )}
                  />
                </button>
              ) : !collapsed ? (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-sgvu-gold/80">
                  {group.title}
                </p>
              ) : null}

              {groupExpanded ? (
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.href}>{renderNavLink(item, { persistOnNavigate: true })}</li>
                  ))}
                </ul>
              ) : null}

              {!collapsed && <Separator className="mt-4 bg-white/10" />}
            </div>
          );
        })}
      </nav>
    </ScrollArea>
  );

  const nativeNav = (
    <nav
      ref={navRef}
      aria-label="Workspace modules"
      className={cn(
        'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 py-4',
        '[scrollbar-gutter:stable]',
        isExecutivePortal && 'pb-6',
      )}
    >
      <div className={cn('space-y-4 pb-8', isExecutivePortal && 'space-y-5')}>
        {navGroups.map((group, groupIndex) => (
          <div key={group.title}>
            {!collapsed && (
              <p
                className={cn(
                  'mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-sgvu-gold/80',
                  isExecutivePortal && 'mb-2.5 tracking-[0.18em] text-sgvu-gold/75',
                )}
              >
                {group.title}
              </p>
            )}
            <ul className={cn('space-y-1', isExecutivePortal && 'space-y-1.5')}>
              {group.items.map((item) => (
                <li key={item.href}>{renderNavLink(item, { executive: isExecutivePortal })}</li>
              ))}
            </ul>
            {!collapsed && groupIndex < navGroups.length - 1 && (
              <Separator className={cn('mt-4 bg-white/10', isExecutivePortal && 'mt-5 bg-white/8')} />
            )}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <aside
      ref={asideRef}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden border-r border-sgvu-gold/25 bg-sgvu-navy text-white transition-[width] duration-200',
        isExecutivePortal &&
          'border-sgvu-gold/20 bg-[linear-gradient(180deg,var(--color-sgvu-navy)_0%,#071a35_100%)] shadow-[8px_0_32px_rgba(4,20,44,0.14)]',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative shrink-0',
          collapsed
            ? 'flex h-16 items-center justify-center px-2'
            : cn(
                'flex flex-col items-center px-3 py-3 text-center',
                isExecutivePortal && 'min-h-[116px] justify-center py-4',
              ),
        )}
      >
        {!collapsed && (
          <div className="flex w-full flex-col items-center gap-1.5">
            <FalconLogo size={isExecutivePortal ? 52 : 48} className="mx-auto" />
            <p
              className={cn(
                'text-[9px] font-semibold uppercase tracking-[0.2em] text-sgvu-gold/90',
                !isExecutivePortal && 'font-medium tracking-[0.14em] text-sgvu-gold/85',
              )}
            >
              {sidebarBrandLabel}
            </p>
            <p className="max-w-full truncate text-[10px] font-medium tracking-wide text-blue-100/70">
              {personaLabel}
            </p>
          </div>
        )}
        {collapsed && <FalconLogo size={36} compact className="mx-auto" />}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={cn(
            'absolute hidden shrink-0 text-white hover:bg-white/10 lg:flex',
            collapsed ? 'right-1 top-2' : 'right-1 top-2',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {collapsibleNavGroups ? collapsibleNav : nativeNav}
    </aside>
  );
}
