import type { ReactNode } from 'react';
import { AdmissionsCrmShell } from '@/components/layout/AdmissionsCrmShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function AdmissionsCrmLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <AdmissionsCrmShell>{children}</AdmissionsCrmShell>
    </RoleGate>
  );
}
