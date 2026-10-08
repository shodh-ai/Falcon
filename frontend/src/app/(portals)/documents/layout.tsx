import type { ReactNode } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';

export default function DocumentsPortalLayout({ children }: { children: ReactNode }) {
  return <RoleGate>{children}</RoleGate>;
}
