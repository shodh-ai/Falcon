'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Clock, ExternalLink, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { toast } from 'sonner';

type CatalogHit = {
  catalog_id: string;
  isbn: string;
  title: string;
  author: string;
  category: string;
  cover_image_url: string | null;
  total_copies: number;
  available_copies: number;
};

type MyAccount = {
  active_loans: Array<{
    transaction_id: string;
    title: string;
    author: string;
    due_date: string;
    accession_number: string;
  }>;
  history: Array<{ title: string; returned_at: string }>;
  holds: Array<{ title: string; status: string; queue_position: number }>;
  library_dues: Array<{ fee_head: string; total_amount: string; status: string }>;
  patron_role?: string;
  borrowing_privileges?: {
    max_books: number;
    max_days: number;
    fine_per_day: number;
    label: string;
  };
};

type DigitalResource = {
  resource_id: string;
  title: string;
  resource_type: string;
  category: string;
  external_url: string;
};

type Tab = 'search' | 'account' | 'digital';

export function LibraryOpacPanel({
  basePath,
  title,
  description,
}: {
  basePath: '/student/library' | '/faculty/library';
  title: string;
  description: string;
}) {
  const api = useAuthedApi();
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [digital, setDigital] = useState<DigitalResource[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const hits = await api.get<CatalogHit[]>(`/api/library/search?q=${encodeURIComponent(q)}`);
        setResults(hits);
      } finally {
        setSearching(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void runSearch('');
    void api.get<MyAccount>('/api/library/my-account').then(setAccount);
    void api.get<DigitalResource[]>('/api/library/digital-resources').then(setDigital);
  }, [api, runSearch]);

  async function renew(transactionId: string) {
    try {
      const res = await api.post<{ message: string }>(`/api/library/renew/${transactionId}`);
      toast.success(res.message);
      void api.get<MyAccount>('/api/library/my-account').then(setAccount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Renewal failed');
    }
  }

  const daysUntil = (due: string) =>
    Math.ceil((new Date(due).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const renewalLabel =
    (account?.borrowing_privileges?.max_days ?? 0) >= 90 ? 'Renew +30 days' : 'Renew +7 days';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['search', 'Search Catalog', Search],
            ['account', 'My Account', BookOpen],
            ['digital', 'Digital Library', ExternalLink],
          ] as const
        ).map(([id, label, Icon]) => (
          <Button
            key={id}
            size="sm"
            variant={tab === id ? 'default' : 'outline'}
            className={tab === id ? 'bg-sgvu-navy' : ''}
            onClick={() => setTab(id)}
          >
            <Icon className="mr-1.5 h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {tab === 'search' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10 text-base"
              placeholder="Search title, author, ISBN, or subject…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch(query)}
            />
          </div>
          <Button onClick={() => void runSearch(query)} disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((book) => (
              <Link key={book.catalog_id} href={`${basePath}/${book.catalog_id}`}>
                <Card className="h-full transition hover:border-sgvu-gold hover:shadow-md">
                  <CardContent className="flex gap-3 p-4">
                    <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded bg-muted">
                      {book.cover_image_url ? (
                        <Image src={book.cover_image_url} alt="" fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No cover</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-semibold text-sgvu-navy">{book.title}</p>
                      <p className="text-xs text-muted-foreground">{book.author}</p>
                      <div className="mt-2">
                        <Badge variant={book.available_copies > 0 ? 'default' : 'secondary'}>
                          {book.available_copies}/{book.total_copies} available
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === 'account' && (
        <div className="space-y-4">
          {account?.borrowing_privileges && (
            <Card className="border-sgvu-gold/30 bg-sgvu-gold/5">
              <CardContent className="pt-6 text-sm">
                <p className="font-semibold text-sgvu-navy">
                  {account.patron_role} privileges · {account.borrowing_privileges.label}
                </p>
                <p className="text-muted-foreground">
                  Up to {account.borrowing_privileges.max_books} books ·{' '}
                  {account.borrowing_privileges.max_days} day loan period
                  {account.borrowing_privileges.fine_per_day > 0
                    ? ` · ₹${account.borrowing_privileges.fine_per_day}/day overdue fine`
                    : ' · No overdue fines'}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Currently issued</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(account?.active_loans ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No active loans.</p>
              )}
              {(account?.active_loans ?? []).map((loan) => {
                const days = daysUntil(loan.due_date);
                const isFacultyLoan = (account?.borrowing_privileges?.max_days ?? 0) >= 90;
                return (
                  <div
                    key={loan.transaction_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-semibold">{loan.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {loan.accession_number} ·{' '}
                        {isFacultyLoan
                          ? `Due: ${new Date(loan.due_date).toLocaleDateString()} (semester loan)`
                          : `Due ${new Date(loan.due_date).toLocaleDateString()}`}
                      </p>
                      <p
                        className={`text-xs font-medium ${days < 0 ? 'text-red-600' : days <= 3 ? 'text-amber-600' : 'text-emerald-700'}`}
                      >
                        {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void renew(loan.transaction_id)}>
                      {renewalLabel}
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Holds & fines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(account?.holds ?? []).map((h, i) => (
                <p key={i}>
                  {h.title} — {h.status} (queue #{h.queue_position})
                </p>
              ))}
              {!account?.holds?.length && <p className="text-muted-foreground">No active holds.</p>}
              {(account?.library_dues ?? []).map((d, i) => (
                <p key={i} className="font-medium text-red-700">
                  {d.fee_head}: ₹{Number(d.total_amount).toLocaleString()} ({d.status})
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Reading history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {(account?.history ?? []).map((h, i) => (
                <p key={i}>
                  {h.title} — returned {new Date(h.returned_at).toLocaleDateString()}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'digital' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {digital.map((r) => (
            <Card key={r.resource_id}>
              <CardContent className="pt-6">
                <p className="font-semibold">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.resource_type} · {r.category}
                </p>
                <a
                  href={r.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sgvu-navy underline"
                >
                  Open in browser <ExternalLink className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
