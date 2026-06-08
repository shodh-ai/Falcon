'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, CalendarRange, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/ess/team/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/ess/team/attendance', label: 'Attendance', icon: CalendarRange },
  { href: '/ess/team/requests', label: 'Pending on Me', icon: Inbox },
];

export function TeamSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') ?? 'direct';
  const qs = `?scope=${scope}`;

  return (
    <nav className="flex flex-wrap gap-2 border-b border-gray-100 pb-3">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={`${link.href}${qs}`}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sgvu-navy text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-sgvu-navy',
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
