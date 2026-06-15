import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function HrDataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function HrTable({
  children,
  minWidth = '800px',
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <table className="w-full text-sm" style={{ minWidth }}>
      {children}
    </table>
  );
}

export function HrTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </tr>
    </thead>
  );
}

export function HrTh({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn('px-4 py-3', className)}>{children}</th>;
}

export function HrTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}

export function HrTr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-gray-50',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function HrTd({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3.5 align-middle', className)}>{children}</td>;
}
