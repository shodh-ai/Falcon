'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type KanbanCard = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  program?: string;
  city?: string;
  counsellor?: string;
  lastUpdated?: string;
  priority?: 'high' | 'medium' | 'low';
};

export type KanbanColumn = {
  id: string;
  title: string;
  cards: KanbanCard[];
  emptyMessage?: string;
};

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

export function KanbanBoard({
  columns,
  onMove,
  onColumnAction,
  columnActionLabel,
  onCardClick,
  layout = 'grid',
}: {
  columns: KanbanColumn[];
  onMove?: (cardId: string, nextStage: string) => void;
  /** Extra action on cards in a specific column (e.g. HIRED → provision onboarding). */
  onColumnAction?: (cardId: string, columnId: string) => void;
  columnActionLabel?: Record<string, string>;
  onCardClick?: (cardId: string) => void;
  layout?: 'grid' | 'scroll';
}) {
  const boardClassName =
    layout === 'scroll'
      ? 'flex min-w-max gap-4 pb-2'
      : 'grid gap-4 xl:grid-cols-5';

  const columnClassName =
    layout === 'scroll' ? 'w-[min(100vw-2rem,18rem)] shrink-0' : undefined;

  return (
    <div className={layout === 'scroll' ? 'overflow-x-auto' : undefined}>
      <div className={boardClassName}>
      {columns.map((column, columnIndex) => {
        const nextColumn = columns[columnIndex + 1];
        const cards = column.cards ?? [];
        return (
          <section key={column.id} className={cn('rounded-2xl border bg-muted/30 p-3', columnClassName)}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wide text-sgvu-navy">{column.title}</h3>
              <Badge variant="secondary">{cards.length}</Badge>
            </div>
            <div className="space-y-3">
              {cards.map((card) => (
                <article
                  key={card.id}
                  className={cn(
                    'rounded-xl border border-sgvu-navy/10 bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                    onCardClick && 'cursor-pointer',
                  )}
                  onClick={onCardClick ? () => onCardClick(card.id) : undefined}
                  onKeyDown={
                    onCardClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onCardClick(card.id);
                          }
                        }
                      : undefined
                  }
                  role={onCardClick ? 'button' : undefined}
                  tabIndex={onCardClick ? 0 : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sgvu-navy">{card.title}</p>
                    {card.priority ? (
                      <Badge
                        variant="outline"
                        className={`shrink-0 border-transparent text-[10px] uppercase ${PRIORITY_STYLES[card.priority]}`}
                      >
                        {card.priority}
                      </Badge>
                    ) : null}
                  </div>
                  {card.program ? (
                    <p className="mt-1.5 text-xs font-medium text-sgvu-navy/80">{card.program}</p>
                  ) : null}
                  {card.subtitle && <p className="mt-1 text-xs text-muted-foreground">{card.subtitle}</p>}
                  {(card.city || card.counsellor) && (
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {card.city ? <p>📍 {card.city}</p> : null}
                      {card.counsellor ? <p>👤 {card.counsellor}</p> : null}
                    </div>
                  )}
                  {card.lastUpdated ? (
                    <p className="mt-2 text-[10px] text-muted-foreground">Updated {card.lastUpdated}</p>
                  ) : null}
                  {card.meta && !card.program && (
                    <p className="mt-2 text-xs font-medium text-sgvu-gold">{card.meta}</p>
                  )}
                  {nextColumn && onMove && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(card.id, nextColumn.id);
                      }}
                    >
                      Move to {nextColumn.title}
                    </Button>
                  )}
                  {onColumnAction && columnActionLabel?.[column.id] && (
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={(event) => {
                        event.stopPropagation();
                        onColumnAction(card.id, column.id);
                      }}
                    >
                      {columnActionLabel[column.id]}
                    </Button>
                  )}
                </article>
              ))}
              {cards.length === 0 && (
                <p className="rounded-xl border border-dashed border-sgvu-navy/15 bg-background/60 p-4 text-center text-xs text-muted-foreground">
                  {column.emptyMessage ?? 'No applicants'}
                </p>
              )}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}
