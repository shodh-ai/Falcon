'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function RegistrarDeskChrome({
  title,
  subtitle,
  children,
  banner,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  banner?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
            Registrar Portal
          </p>
          <h1 className="mt-1 text-2xl font-bold text-sgvu-navy sm:text-3xl">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
          {banner}
        </CardContent>
      </Card>
      {children}
    </div>
  );
}

export const REG_BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

export const REG_OUTLINE_BTN =
  'border border-[#0B2447] bg-white text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
