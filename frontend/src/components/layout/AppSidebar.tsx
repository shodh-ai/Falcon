'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
}

export function AppSidebar({
  personaLabel,
  navGroups,
  collapsed,
  onToggleCollapse,
  className,
}: AppSidebarProps) {
  const pathname = usePathname();
  const allHrefs = collectNavHrefs(navGroups);
  const isExecutivePortal = personaLabel === 'President / VC';
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    el.scrollTop = readSidebarScroll();
  }, [collapsed]);

  useEffect(() => {
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
  }, []);

  return (
    <aside
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
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sgvu-gold/90">
              SGVU Workspace
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

      {/* Native overflow scroll — Radix ScrollArea was clipping long module lists */}
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
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavHrefActive(pathname, item.href, allHrefs);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition touch-target',
                          isExecutivePortal &&
                            'min-h-11 rounded-2xl px-3.5 py-2.5 font-semibold transition-all duration-200 ease-out',
                          active
                            ? 'bg-sgvu-gold text-sgvu-navy shadow-md'
                            : cn(
                                'text-blue-100 hover:bg-white/10 hover:text-white',
                                isExecutivePortal &&
                                  'text-blue-100/85 hover:translate-x-0.5 hover:bg-white/8',
                              ),
                          collapsed && 'justify-center px-2',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            isExecutivePortal && 'text-white/90 transition-colors',
                            active && isExecutivePortal && 'text-white',
                          )}
                          strokeWidth={isExecutivePortal ? 1.9 : 2}
                        />
                        {!collapsed && (
                          <span
                            className={cn(
                              'min-w-0 flex-1 whitespace-normal break-words leading-snug',
                              isExecutivePortal && 'tracking-[0.005em]',
                            )}
                          >
                            {item.label}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {!collapsed && groupIndex < navGroups.length - 1 && (
                <Separator className={cn('mt-4 bg-white/10', isExecutivePortal && 'mt-5 bg-white/8')} />
              )}
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}
