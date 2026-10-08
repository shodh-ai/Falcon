import type { ReactNode } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';

export default function ReportsPortalLayout({ children }: { children: ReactNode }) {
  return <RoleGate>{children}</RoleGate>;
}
