'use client';

import Link from 'next/link';
import {
  BarChart3,
  Briefcase,
  Bus,
  CalendarClock,
  ClipboardList,
  FileText,
  GraduationCap,
  Plug,
  Settings,
  Shield,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const ICONS = {
  wallet: Wallet,
  'file-text': FileText,
  users: Users,
  'clipboard-list': ClipboardList,
  'bar-chart': BarChart3,
  briefcase: Briefcase,
  bus: Bus,
  'calendar-clock': CalendarClock,
  'graduation-cap': GraduationCap,
  settings: Settings,
  shield: Shield,
  plug: Plug,
} as const satisfies Record<string, LucideIcon>;

export type AdminModuleIconName = keyof typeof ICONS;

export type AdminModuleLink = {
  href: string;
  label: string;
  description: string;
  icon?: AdminModuleIconName;
};

export function AdminModuleHub({
  title,
  description,
  links,
}: {
  title: string;
  description: string;
  links: AdminModuleLink[];
}) {
  const gridClass =
    links.length >= 3
      ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid gap-4 sm:grid-cols-2';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 text-center md:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">{title}</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </CardContent>
      </Card>

      <div className={gridClass}>
        {links.map((link) => {
          const Icon = link.icon ? ICONS[link.icon] : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/60"
            >
              <Card className="h-full border-sgvu-navy/10 bg-white shadow-sm transition hover:border-sgvu-navy/40 hover:shadow-md">
                <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
                  {Icon ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sgvu-navy/10 bg-white">
                      <Icon className="h-5 w-5 text-sgvu-gold" aria-hidden />
                    </span>
                  ) : null}
                  <div className="w-full space-y-1.5">
                    <p className="text-base font-semibold leading-snug text-sgvu-navy">{link.label}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{link.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
