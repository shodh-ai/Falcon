'use client';

import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DataTableColumn } from '@/components/ui/DataTable';

const VIRTUALIZE_THRESHOLD = 50;
const ROW_HEIGHT_PX = 52;

export interface VirtualizedDataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, rowIndex: number) => string | number;
  emptyMessage?: ReactNode;
  isLoading?: boolean;
}

function TableHeader<T>({ columns }: { columns: DataTableColumn<T>[] }) {
  return (
    <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col) => (
        <div
          key={col.key}
          className={`px-5 py-3 text-left text-sm font-bold text-slate-600 ${col.className ?? ''}`}
        >
          {col.header}
        </div>
      ))}
    </div>
  );
}

/**
 * Renders only visible rows for large datasets (hostel roll call, finance ledgers, etc.).
 */
export function VirtualizedDataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  isLoading,
}: VirtualizedDataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = rows.length >= VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
    enabled: shouldVirtualize,
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500 shadow-sm">
        Loading…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500 shadow-sm">
        {emptyMessage ?? 'No records found.'}
      </div>
    );
  }

  if (!shouldVirtualize) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <TableHeader columns={columns} />
        {rows.map((row, idx) => (
          <div
            key={rowKey(row, idx)}
            className="grid border-b border-slate-100 text-sm hover:bg-slate-50"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((col) => (
              <div key={col.key} className={`px-5 py-4 ${col.className ?? ''}`}>
                {col.render(row, idx)}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <TableHeader columns={columns} />
      <div ref={parentRef} className="max-h-[min(70vh,720px)] overflow-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={rowKey(row, virtualRow.index)}
                className="absolute left-0 top-0 grid w-full border-b border-slate-100 text-sm hover:bg-slate-50"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                }}
              >
                {columns.map((col) => (
                  <div key={col.key} className={`px-5 py-4 ${col.className ?? ''}`}>
                    {col.render(row, virtualRow.index)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
