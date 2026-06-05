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

export function StudentPageShell({ children, className, width = '6xl' }: StudentPageShellProps) {
  return (
    <div className={cn('mx-auto w-full space-y-6 p-4 md:p-6', widthClass[width], className)}>
      {children}
    </div>
  );
}
