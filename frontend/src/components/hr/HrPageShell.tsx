import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Canonical HR portal content width. Applied once in hr/layout.tsx —
 * pages should not add their own max-width or page padding.
 */
export function HrPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl space-y-6', className)}>
      {children}
    </div>
  );
}
