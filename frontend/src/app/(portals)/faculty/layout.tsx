import type { ReactNode } from 'react';
import { FacultyShell } from '@/components/layout/FacultyShell';

export default function FacultyPortalLayout({ children }: { children: ReactNode }) {
  return <FacultyShell>{children}</FacultyShell>;
}
