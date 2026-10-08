'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared content width — header and main use the same value in FacultyShell */
export const FACULTY_CONTENT_MAX_CLASS = 'max-w-6xl';

export function FacultyPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0 space-y-4 overflow-x-hidden', className)}>{children}</div>;
}
