'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { LeadershipHubRoute } from '@/lib/leadership-hub-routes';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';
import { isNavHrefActive } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { EXECUTIVE_CARD, EXECUTIVE_TYPO } from './design-tokens';

type Props = {
  title?: string;
  description?: string;
  routes: LeadershipHubRoute[];
  compact?: boolean;
  className?: string;
};

export function ExecutiveFeatureGrid({ title, description, routes, compact = false, className }: Props) {
  const pathname = usePathname() ?? '';
  const routeHrefs = routes.map((route) => route.href);

  return (
    <section className={className}>
      {title ? (
        <div className="mb-4">
          <h2 className={EXECUTIVE_TYPO.sectionTitle}>{title}</h2>
          {description ? <p className={cn('mt-1', EXECUTIVE_TYPO.bodySecondary)}>{description}</p> : null}
        </div>
      ) : null}
      <div
        className={cn(
          'grid gap-4',
          compact ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        )}
      >
        {routes.map((route) => {
          const active = isNavHrefActive(pathname, route.href, routeHrefs);
          const gated = route.requiresFinanceModule && !isLaunchModuleEnabled('finance');
          const Icon = route.icon;

          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                EXECUTIVE_CARD,
                'group flex flex-col p-5 transition hover:shadow-md',
                active && 'border-sgvu-gold ring-1 ring-sgvu-gold/40',
                gated && 'opacity-60',
              )}
              title={gated ? 'Requires finance module — preview mode available' : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    active ? 'bg-sgvu-gold/15 text-sgvu-navy' : 'bg-sgvu-navy/5 text-sgvu-navy',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sgvu-gold" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-sgvu-navy">{route.label}</h3>
              {!compact ? (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{route.description}</p>
              ) : null}
              {gated ? (
                <span className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  Preview · finance module off
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
