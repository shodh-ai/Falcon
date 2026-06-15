import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PlacementPageShell({
  children,
  className,
  width = '6xl',
}: {
  children: ReactNode;
  className?: string;
  width?: '5xl' | '6xl' | '7xl' | 'full';
}) {
  const max =
    width === 'full' ? 'max-w-none' : width === '7xl' ? 'max-w-7xl' : width === '5xl' ? 'max-w-5xl' : 'max-w-6xl';

  return (
    <div className={cn('mx-auto w-full space-y-6 p-4 md:p-6', max, className)}>
      {children}
    </div>
  );
}
