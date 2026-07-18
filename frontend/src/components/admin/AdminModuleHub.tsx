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
      <div>
        <h1 className="text-2xl font-semibold text-sgvu-navy">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => {
          const Icon = link.icon ? ICONS[link.icon] : null;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="h-full transition hover:border-sgvu-navy/40">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {Icon ? <Icon className="h-4 w-4 text-sgvu-gold" /> : null}
                    {link.label}
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
