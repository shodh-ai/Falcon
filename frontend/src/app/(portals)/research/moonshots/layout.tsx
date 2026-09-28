import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default function DeferredResearchMoonshotsLayout({
  children: _children,
}: Readonly<{ children: ReactNode }>) {
  notFound();
}
