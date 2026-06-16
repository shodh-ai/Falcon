'use client';

import { ChevronDown, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParentChild } from '@/context/ParentChildContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HEADER_CONTROL_CLASS } from '@/components/layout/header-styles';
import { cn } from '@/lib/utils';

type ParentChildSwitcherProps = {
  variant?: 'header' | 'banner';
};

export function ParentChildSwitcher({ variant = 'banner' }: ParentChildSwitcherProps) {
  const { children, selectedChild, setSelectedChildId, loading } = useParentChild();

  if (loading) {
    if (variant === 'header') {
      return <div className="h-9 w-28 animate-pulse rounded-md border bg-muted/40 sm:w-36" />;
    }
    return (
      <div className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground animate-pulse">
        Loading children…
      </div>
    );
  }

  if (children.length === 0) {
    if (variant === 'header') {
      return (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-800 sm:px-3 sm:py-2 sm:text-xs">
          No linked students
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">No linked students on this account.</p>;
  }

  if (variant === 'header') {
    if (children.length === 1) {
      const sole = children[0];
      return (
        <div
          className={cn('inline-flex max-w-[140px] gap-1.5 px-2 sm:max-w-[180px] sm:gap-2 sm:px-3', HEADER_CONTROL_CLASS)}
          title={sole.department ?? undefined}
        >
          <GraduationCap className="h-4 w-4 shrink-0 text-sgvu-gold" />
          <span className="truncate text-xs font-medium text-foreground sm:text-sm">{sole.name}</span>
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('shrink-0 gap-1.5 px-2 sm:gap-2 sm:px-3', HEADER_CONTROL_CLASS)} title="Switch child">
            <GraduationCap className="h-4 w-4 shrink-0 text-sgvu-gold" />
            <span className="max-w-[88px] truncate whitespace-nowrap text-xs sm:max-w-[140px] sm:text-sm">
              {selectedChild?.name ?? 'Select child'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {children.map((child) => (
            <DropdownMenuItem
              key={child.student_user_id}
              className="cursor-pointer"
              onClick={() => setSelectedChildId(child.student_user_id)}
            >
              <div>
                <p className="font-semibold text-sgvu-navy">{child.name}</p>
                {child.department ? (
                  <p className="text-xs text-muted-foreground">{child.department}</p>
                ) : null}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full max-w-md items-center justify-between gap-2 rounded-2xl border border-sgvu-navy/15 bg-white px-4 py-3 text-left shadow-sm transition hover:border-sgvu-gold/50">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Viewing</p>
          <p className="truncate text-base font-bold text-sgvu-navy">{selectedChild?.name ?? 'Select child'}</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-sgvu-navy" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {children.map((child) => (
          <DropdownMenuItem
            key={child.student_user_id}
            className="cursor-pointer py-3"
            onClick={() => setSelectedChildId(child.student_user_id)}
          >
            <div>
              <p className="font-semibold text-sgvu-navy">{child.name}</p>
              {child.department ? (
                <p className="text-xs text-muted-foreground">{child.department}</p>
              ) : null}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
