'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList, Megaphone, Plus, ScrollText, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { HEADER_CONTROL_CLASS } from '@/components/layout/header-styles';

const ACTIONS = [
  { href: '/leadership/memos', label: 'New Memo', icon: ScrollText },
  { href: '/leadership/tasks', label: 'Assign Task', icon: ClipboardList },
  { href: '/leadership/broadcasts', label: 'Broadcast Message', icon: Megaphone },
  { href: '/leadership/forecasting', label: 'Request Report', icon: TrendingUp },
] as const;

export function ChairmanQuickActions({ variant = 'header' }: { variant?: 'header' | 'fab' }) {
  const router = useRouter();
  const pathname = usePathname();

  if (!pathname?.startsWith('/leadership')) return null;

  const menu = (
    <>
      <DropdownMenuLabel>Chairman Actions</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {ACTIONS.map((action) => (
        <DropdownMenuItem
          key={action.href}
          className="cursor-pointer gap-2"
          onClick={() => router.push(action.href)}
        >
          <action.icon className="h-4 w-4 text-sgvu-gold" />
          {action.label}
        </DropdownMenuItem>
      ))}
    </>
  );

  if (variant === 'fab') {
    return (
      <div className="fixed bottom-20 right-4 z-50 lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-sgvu-navy text-white shadow-[0_8px_30px_rgba(8,35,74,0.25)] hover:bg-sgvu-navy/90"
              aria-label="Quick actions"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('hidden gap-1.5 sm:inline-flex', HEADER_CONTROL_CLASS)}>
          <Plus className="h-4 w-4 text-sgvu-gold" />
          Quick Action
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {menu}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
