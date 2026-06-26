'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { EXECUTIVE_CARD } from './design-tokens';
import type { RedFlag } from './types';

export function RedFlagsWidget({ flags, maxItems }: { flags: RedFlag[]; maxItems?: number }) {
  const shown = maxItems ? flags.slice(0, maxItems) : flags;

  if (flags.length === 0) {
    return (
      <div className={`${EXECUTIVE_CARD} border-emerald-200 bg-emerald-50/60 p-5 md:p-6`}>
        <p className="text-sm font-semibold text-emerald-800">All clear — no red flags in this period</p>
      </div>
    );
  }

  return (
    <div className={`${EXECUTIVE_CARD} border-red-200 bg-red-50/80 p-5 md:p-6`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-red-800">Needs Attention</h2>
        </div>
        {maxItems && flags.length > maxItems ? (
          <Link href="/leadership/issues" className="text-xs font-bold text-red-700 hover:underline">
            +{flags.length - maxItems} more
          </Link>
        ) : null}
      </div>
      <ul className="space-y-2">
        {shown.map((flag) => (
          <li key={`${flag.pillar}-${flag.message}`}>
            <Link
              href={flag.href}
              className="flex items-start gap-2 rounded-lg border border-red-100 bg-white/80 px-3 py-2.5 text-sm text-red-900 transition hover:bg-white"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${flag.severity === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}
              />
              <span>{flag.message}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
