'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type KanbanCard = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

export type KanbanColumn = {
  id: string;
  title: string;
  cards: KanbanCard[];
};

export function KanbanBoard({
  columns,
  onMove,
}: {
  columns: KanbanColumn[];
  onMove?: (cardId: string, nextStage: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {columns.map((column, columnIndex) => {
        const nextColumn = columns[columnIndex + 1];
        const cards = column.cards ?? [];
        return (
          <section key={column.id} className="rounded-2xl border bg-muted/30 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wide text-sgvu-navy">{column.title}</h3>
              <Badge variant="secondary">{cards.length}</Badge>
            </div>
            <div className="space-y-3">
              {cards.map((card) => (
                <article key={card.id} className="rounded-xl border bg-background p-4 shadow-sm">
                  <p className="font-semibold text-sgvu-navy">{card.title}</p>
                  {card.subtitle && <p className="mt-1 text-xs text-muted-foreground">{card.subtitle}</p>}
                  {card.meta && <p className="mt-2 text-xs font-medium text-sgvu-gold">{card.meta}</p>}
                  {nextColumn && onMove && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => onMove(card.id, nextColumn.id)}
                    >
                      Move to {nextColumn.title}
                    </Button>
                  )}
                </article>
              ))}
              {cards.length === 0 && (
                <p className="rounded-xl border border-dashed bg-background/60 p-4 text-center text-xs text-muted-foreground">
                  No applicants
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
