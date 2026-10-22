'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getExamCellSection } from '@/lib/exam-cell/sections';
import { collectNavHrefs, resolveActiveNavHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import styles from './ExamCellWorkspace.module.css';

/** Related pages share one workspace; each tab keeps its existing deep link. */
export function ExamCellWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = getExamCellSection(pathname);
  const activeHref = section ? resolveActiveNavHref(pathname, collectNavHrefs([section])) : null;
  const activeTabRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      {section && (
        <div className="overflow-hidden rounded-xl border border-sgvu-navy/10 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <p className="text-xs font-semibold tracking-wide text-sgvu-navy/70">{section.title}</p>
            {section.items.length > 4 && <span className="text-[11px] text-muted-foreground sm:hidden">Swipe for more pages →</span>}
            <p className="sr-only">{section.description}</p>
          </div>
          <nav aria-label={`${section.title} pages`} className={cn('overflow-x-auto', styles.tabs)}>
            <ul className="flex w-max min-w-full gap-1 px-2 py-2 sm:w-auto sm:flex-wrap sm:px-3">
              {section.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      ref={active ? activeTabRef : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold focus-visible:ring-offset-2',
                        active
                          ? 'border-sgvu-gold bg-sgvu-gold/15 text-sgvu-navy'
                          : 'border-transparent text-slate-600 hover:border-sgvu-navy/10 hover:bg-white hover:text-sgvu-navy',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
