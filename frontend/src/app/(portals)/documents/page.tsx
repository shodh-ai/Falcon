'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function DocumentsVaultPage() {
  const api = useAuthedApi();
  const [docs, setDocs] = useState<Array<{ folder: string; title: string; file_url: string }>>([]);
  useEffect(() => {
    void api.get('/api/reports/documents').then(setDocs).catch(() => setDocs([]));
  }, [api]);

  const folders = [...new Set(docs.map((d) => d.folder))];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Global Policy Vault</h1>
      <p className="text-sm text-muted-foreground">Read-only ordinances, NEP rules, evaluation policies, and blank formats.</p>
      {folders.map((folder) => (
        <section key={folder}>
          <h2 className="font-semibold">{folder}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {docs
              .filter((d) => d.folder === folder)
              .map((d) => (
                <li key={d.title}>
                  <a className="text-sgvu-navy underline" href={d.file_url}>
                    {d.title}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
