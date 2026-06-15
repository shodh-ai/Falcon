'use client';

import { Button } from '@/components/ui/button';

type Props = {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
};

export function PaginationBar({ total, limit, offset, onPageChange }: Props) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={offset <= 0}
          onClick={() => onPageChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <span>
          Page {page} of {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={offset + limit >= total}
          onClick={() => onPageChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
