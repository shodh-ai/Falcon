'use client';

import Link from 'next/link';
import {
  ArrowRight,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => {
          const Icon = link.icon ? ICONS[link.icon] : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/60"
            >
              <Card className="h-full border-sgvu-navy/10 bg-white shadow-sm transition hover:border-sgvu-navy/40 hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-sgvu-navy">
                    {Icon ? <Icon className="h-4 w-4 shrink-0 text-sgvu-gold" /> : null}
                    <span className="min-w-0 flex-1">{link.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
