import type { ReactNode } from 'react';
import { FinanceShell } from '@/components/layout/FinanceShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <FinanceShell>{children}</FinanceShell>
    </RoleGate>
  );
}
