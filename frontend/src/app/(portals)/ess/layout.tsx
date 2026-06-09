import type { ReactNode } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';

/** Legacy /ess URLs redirect into the user's primary workspace (no separate ESS shell). */
export default function EssLegacyLayout({ children }: { children: ReactNode }) {
  return <RoleGate>{children}</RoleGate>;
}
