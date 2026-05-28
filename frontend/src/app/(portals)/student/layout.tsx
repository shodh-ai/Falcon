import type { ReactNode } from 'react';
import { StudentShell } from '@/components/layout/StudentShell';

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
