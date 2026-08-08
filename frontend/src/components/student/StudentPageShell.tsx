import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StudentPageShellProps = {
  children: ReactNode;
  className?: string;
  /** max-w-6xl (default), max-w-5xl, max-w-4xl, or full */
  width?: '4xl' | '5xl' | '6xl' | 'full';
};

const widthClass = {
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-none',
};

/** Page wrapper for student routes — padding comes from AppShell; avoid double gutters on mobile. */
export function StudentPageShell({ children, className, width = '6xl' }: StudentPageShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full min-w-0 space-y-4 sm:space-y-5 md:space-y-6',
        '[&_img]:h-auto [&_img]:max-w-full',
        width === 'full' && 'max-w-none',
        width !== 'full' && widthClass[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
