'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { withAccessToken } from '@/lib/authenticated-download-url';

export default function DocumentsVaultPage() {
  const api = useAuthedApi();
  const [docs, setDocs] = useState<Array<{ folder: string; title: string; file_url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    setLoading(true);
    setError(null);
    void api
      .get<Array<{ folder: string; title: string; file_url: string }>>('/api/reports/documents')
      .then(setDocs)
      .catch((err: unknown) => {
        setDocs([]);
        setError(err instanceof Error ? err.message : 'Could not load documents.');
      })
      .finally(() => setLoading(false));
  }, [api]);

  const folders = [...new Set(docs.map((d) => d.folder))];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Global Policy Vault</h1>
      <p className="text-sm text-muted-foreground">Read-only ordinances, NEP rules, evaluation policies, and blank formats.</p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading documents…
        </div>
      ) : null}
      {!loading && error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!loading && !error && folders.length === 0 ? (
        <p className="rounded-xl border border-sgvu-navy/10 bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          No policy documents available yet.
        </p>
      ) : null}
      {folders.map((folder) => (
        <section key={folder}>
          <h2 className="font-semibold">{folder}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {docs
              .filter((d) => d.folder === folder)
              .map((d) => (
                <li key={d.title}>
                  <a className="text-sgvu-navy underline" href={withAccessToken(d.file_url, token)}>
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
