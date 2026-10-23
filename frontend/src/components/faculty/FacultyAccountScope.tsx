'use client';

import { Fragment, useState, type ReactNode } from 'react';

/** Discard account-owned drafts and responses before rendering another API session. */
export function FacultyAccountScope({ scope, children }: { scope: object; children: ReactNode }) {
  const [current, setCurrent] = useState(() => ({ scope, revision: 0 }));
  if (current.scope !== scope) {
    setCurrent({ scope, revision: current.revision + 1 });
    return null;
  }
  return <Fragment key={current.revision}>{children}</Fragment>;
}
