'use client';

import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T, rowIndex: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, rowIndex: number) => string | number;
  emptyMessage?: ReactNode;
  isLoading?: boolean;
}

/**
 * Generic table primitive intended to replace the dozens of hand-rolled
 * <table> blocks scattered across Admissions / HR / Finance / etc.
 * Keep this dumb: no sorting/pagination logic here — wire those in
 * higher-level wrappers per domain when needed.
 */
export function DataTable<T>({ columns, rows, rowKey, emptyMessage, isLoading }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-5 py-3 text-left font-bold text-slate-600 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading && (
            <tr>
              <td className="px-5 py-8 text-center text-slate-500" colSpan={columns.length}>
                Loading…
              </td>
            </tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td className="px-5 py-8 text-center text-slate-500" colSpan={columns.length}>
                {emptyMessage ?? 'No records found.'}
              </td>
            </tr>
          )}
          {!isLoading &&
            rows.map((row, idx) => (
              <tr key={rowKey(row, idx)} className="hover:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className={`px-5 py-4 ${col.className ?? ''}`}>
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
