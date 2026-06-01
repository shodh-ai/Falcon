'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FalconLogo } from '@/components/brand/FalconLogo';
import type { NavGroup } from '@/lib/navigation';

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
          'flex h-[4.5rem] items-center border-b border-white/10 px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && (
          <div className="min-w-0 px-1">
            <p className="text-lg font-black tracking-tight text-white">Falcon</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-sgvu-gold/85">
              SGVU Workspace
            </p>
            <p className="mt-1 truncate text-[11px] font-medium text-blue-100/70">{personaLabel}</p>
          </div>
        )}
        {collapsed && <FalconLogo size={32} />}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={cn(
            'hidden shrink-0 text-white hover:bg-white/10 lg:flex',
            collapsed && 'absolute right-1 top-3',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="space-y-4">
          {navGroups.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-sgvu-gold/80">
                  {group.title}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
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
              {!collapsed && <Separator className="mt-4 bg-white/10" />}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
