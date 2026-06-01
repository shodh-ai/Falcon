import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';

export default function ParentLayout({ children }: { children: ReactNode }) {
  return <GenericPortalShell portal="parent">{children}</GenericPortalShell>;
}
