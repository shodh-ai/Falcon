'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export const WORKFORCE_LIST_PREVIEW = 4;

export function useShowMoreList<T>(items: T[], resetKey?: string) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  const hasMore = items.length > WORKFORCE_LIST_PREVIEW;
  const visible = expanded ? items : items.slice(0, WORKFORCE_LIST_PREVIEW);

  return {
    visible,
    hasMore,
    expanded,
    hiddenCount: Math.max(0, items.length - WORKFORCE_LIST_PREVIEW),
    toggle: () => setExpanded((v) => !v),
  };
}

export function ShowMoreButton({
  expanded,
  hiddenCount,
  onClick,
}: {
  expanded: boolean;
  hiddenCount: number;
  onClick: () => void;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="mt-2 h-8 text-xs font-medium text-sgvu-navy hover:text-sgvu-gold"
      onClick={onClick}
    >
      {expanded ? 'Show less' : `See more (${hiddenCount})`}
    </Button>
  );
}
