'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const storageKey = storageKeyForGroups(personaLabel);

  const defaultExpanded = useMemo(
    () => Object.fromEntries(navGroups.map((group) => [group.title, true])),
    [navGroups],
  );

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(defaultExpanded);

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

  const toggleGroup = (title: string) => {
    setExpandedGroups((current) => ({ ...current, [title]: !current[title] }));
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sgvu-gold/25 bg-sgvu-navy text-white transition-[width] duration-200',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative',
          collapsed
            ? 'flex h-16 items-center justify-center px-2'
            : 'flex flex-col items-center px-3 py-3 text-center',
        )}
      >
        {!collapsed && (
          <div className="flex w-full flex-col items-center gap-1">
            <FalconLogo size={48} className="mx-auto" />
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-sgvu-gold/85">
              {sidebarBrandLabel}
            </p>
            <p className="max-w-full truncate text-[10px] font-medium text-blue-100/70">{personaLabel}</p>
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

      <ScrollArea className="min-h-0 flex-1 px-2 py-4 [&_[data-radix-scroll-area-thumb]]:bg-white/20 [&_[data-radix-scroll-area-thumb]:hover]:bg-white/30">
        <nav className="space-y-4">
          {navGroups.map((group) => {
            const groupExpanded = collapsed || !collapsibleNavGroups || expandedGroups[group.title] !== false;
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
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isNavHrefActive(pathname, item.href, allHrefs);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            aria-label={collapsed ? item.label : undefined}
                            className={cn(
                              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition touch-target',
                              active
                                ? 'bg-sgvu-gold text-sgvu-navy shadow-md'
                                : 'text-blue-100 hover:bg-white/10 hover:text-white',
                              collapsed && 'justify-center px-2',
                            )}
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {!collapsed && <Separator className="mt-4 bg-white/10" />}
              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
