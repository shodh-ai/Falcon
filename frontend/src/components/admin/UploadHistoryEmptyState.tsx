'use client';

import Link from 'next/link';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_BTN =
  'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-bold text-white transition-colors hover:bg-[#123A6D] active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

export function UploadHistoryEmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-dashed border-sgvu-navy/20 bg-slate-50/70 px-6 py-10 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-gold">
          <Upload className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <p className="text-base font-semibold text-sgvu-navy">No matching uploads</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Try another search term or clear filters to see the full history.
        </p>
        <button
          type="button"
          className={cn('mt-5', ACTION_BTN)}
          onClick={onClearFilters}
          data-testid="upload-history-empty-clear-filters"
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-dashed border-sgvu-navy/20 bg-slate-50/70 px-6 py-10 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-gold">
        <Upload className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
      <p className="text-base font-semibold text-sgvu-navy">No upload history yet</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Complete a governance task to see submissions here.
      </p>
      <Link
        href="/admin/tasks"
        className={cn('mt-5', ACTION_BTN)}
        data-testid="upload-history-empty-primary"
      >
        Go to Governance Tasks
      </Link>
    </div>
  );
}
