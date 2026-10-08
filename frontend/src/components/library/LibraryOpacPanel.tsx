'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookMarked, BookOpen, Clock, ExternalLink, Library, Loader2, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import {
  facultyDemoDigitalResources,
  facultyDemoLibraryAccount,
  facultyDemoLibraryCatalog,
} from '@/lib/mock/faculty-portal-demo';

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

function BookCover({ title, coverUrl }: { title: string; coverUrl: string | null }) {
  if (coverUrl) {
    return (
      <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted shadow-md">
        <Image src={coverUrl} alt={title} fill className="object-cover" unoptimized />
      </div>
    );
  }

  return (
    <div className="relative flex h-32 w-24 shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-sgvu-navy/15 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-800 p-3 shadow-md">
      <BookOpen className="h-5 w-5 text-sgvu-gold/80" />
      <p className="line-clamp-3 text-[10px] font-semibold leading-tight text-white/90">{title}</p>
    </div>
  );
}

export function LibraryOpacPanel({
  basePath = '/student/library',
  title = 'Library OPAC',
  description = 'Search the catalog, manage loans, and open digital resources.',
  embedded = false,
}: {
  basePath?: '/student/library' | '/faculty/library';
  title?: string;
  description?: string;
  /** Hide inner page title when parent already renders a portal header */
  embedded?: boolean;
}) {
  const api = useAuthedApi();
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [digital, setDigital] = useState<DigitalResource[]>([]);
  const [searching, setSearching] = useState(false);

  const facultySmoke = basePath === '/faculty/library';

  const runSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const hits = await api.get<CatalogHit[]>(`/api/library/search?q=${encodeURIComponent(q)}`);
        setResults(
          facultySmoke
            ? withFacultyDemoFallback(hits, facultyDemoLibraryCatalog() as CatalogHit[], isEmptyArray)
            : hits,
        );
      } catch {
        setResults(
          facultySmoke
            ? withFacultyDemoFallback([], facultyDemoLibraryCatalog() as CatalogHit[], isEmptyArray)
            : [],
        );
      } finally {
        setSearching(false);
      }
    },
    [api, facultySmoke],
  );

  useEffect(() => {
    void runSearch('');
    void api
      .get<MyAccount>('/api/library/my-account')
      .then((account) =>
        setAccount(
          facultySmoke
            ? withFacultyDemoFallback(
                account,
                facultyDemoLibraryAccount() as MyAccount,
                (v) => !v?.active_loans?.length && !v?.holds?.length,
              )
            : account,
        ),
      )
      .catch(() => {
        if (facultySmoke) {
          setAccount(withFacultyDemoFallback(null, facultyDemoLibraryAccount() as MyAccount));
        }
      });
    void api
      .get<DigitalResource[]>('/api/library/digital-resources')
      .then((rows) =>
        setDigital(
          facultySmoke
            ? withFacultyDemoFallback(
                rows,
                facultyDemoDigitalResources() as DigitalResource[],
                isEmptyArray,
              )
            : rows,
        ),
      )
      .catch(() => {
        if (facultySmoke) {
          setDigital(
            withFacultyDemoFallback(
              [],
              facultyDemoDigitalResources() as DigitalResource[],
              isEmptyArray,
            ),
          );
        }
      });
  }, [api, facultySmoke, runSearch]);

  async function renew(transactionId: string) {
    if (isFacultyDemoSmokeId(transactionId)) {
      toast.success('Loan renewed for +7 days (demo)');
      setAccount((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          active_loans: prev.active_loans.map((loan) =>
            loan.transaction_id === transactionId
              ? {
                  ...loan,
                  due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                }
              : loan,
          ),
        };
      });
      return;
    }
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

  const availableCount = results.filter((b) => b.available_copies > 0).length;
  const activeLoans = account?.active_loans?.length ?? 0;
  const holdsCount = account?.holds?.length ?? 0;

  return (
    <div className={cn('space-y-6', embedded ? 'p-5 md:p-6' : 'space-y-4')}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-black text-sgvu-navy">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StudentStatCard label="Catalog hits" value={results.length} helper={`${availableCount} titles available now`} icon={Library} tone="gold" />
        <StudentStatCard label="Active loans" value={activeLoans} helper="Currently issued to you" icon={BookMarked} />
        <StudentStatCard label="Holds & dues" value={holdsCount + (account?.library_dues?.length ?? 0)} helper="Queue and outstanding fines" icon={Clock} tone={account?.library_dues?.length ? 'warning' : 'default'} />
      </div>

      <StudentTabBar
        tabs={[
          { id: 'search' as const, label: 'Search Catalog', count: results.length },
          { id: 'account' as const, label: 'My Account', count: activeLoans },
          { id: 'digital' as const, label: 'Digital Library', count: digital.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'search' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 rounded-2xl pl-12 text-base shadow-sm"
                placeholder="Search title, author, ISBN, or subject…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runSearch(query)}
              />
            </div>
            <Button
              className="h-12 rounded-2xl px-8 bg-sgvu-navy sm:shrink-0"
              onClick={() => void runSearch(query)}
              disabled={searching}
            >
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>

          {searching && results.length === 0 ? (
            <StudentEmptyState icon={Search} title="Searching catalog…" description="Fetching live availability from the OPAC." />
          ) : results.length === 0 ? (
            <StudentEmptyState icon={BookOpen} title="No matches" description="Try a different title, author, or ISBN." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((book) => (
                <Link key={book.catalog_id} href={`${basePath}/${book.catalog_id}`} className="group block h-full">
                  <article className="flex h-full gap-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/50 hover:shadow-md">
                    <BookCover title={book.title} coverUrl={book.cover_image_url} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="line-clamp-2 font-semibold text-sgvu-navy group-hover:text-sgvu-navy">{book.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{book.category}</p>
                      <div className="mt-auto pt-3">
                        <Badge variant={book.available_copies > 0 ? 'success' : 'secondary'}>
                          {book.available_copies}/{book.total_copies} available
                        </Badge>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'account' && (
        <div className="space-y-5">
          {account?.borrowing_privileges && (
            <StudentSectionCard
              title={`${account.patron_role ?? 'Patron'} privileges`}
              description={account.borrowing_privileges.label}
              icon={UserRound}
              tone="gold"
            >
              <p className="text-sm text-muted-foreground">
                Up to {account.borrowing_privileges.max_books} books · {account.borrowing_privileges.max_days} day loan period
                {account.borrowing_privileges.fine_per_day > 0
                  ? ` · ₹${account.borrowing_privileges.fine_per_day}/day overdue fine`
                  : ' · No overdue fines'}
              </p>
            </StudentSectionCard>
          )}

          <StudentSectionCard title="Currently issued" description="Active loans and renewal options" icon={BookMarked}>
            {(account?.active_loans ?? []).length === 0 ? (
              <StudentEmptyState title="No active loans" description="Borrowed books will appear here." />
            ) : (
              <div className="space-y-3">
                {(account?.active_loans ?? []).map((loan) => {
                  const days = daysUntil(loan.due_date);
                  const isFacultyLoan = (account?.borrowing_privileges?.max_days ?? 0) >= 90;
                  return (
                    <div
                      key={loan.transaction_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white p-4"
                    >
                      <div>
                        <p className="font-semibold text-sgvu-navy">{loan.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {loan.accession_number} ·{' '}
                          {isFacultyLoan
                            ? `Due: ${new Date(loan.due_date).toLocaleDateString()} (semester loan)`
                            : `Due ${new Date(loan.due_date).toLocaleDateString()}`}
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-xs font-semibold',
                            days < 0 ? 'text-red-600' : days <= 3 ? 'text-amber-600' : 'text-emerald-700',
                          )}
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
              </div>
            )}
          </StudentSectionCard>

          <StudentSectionCard title="Holds & fines" description="Reservation queue and library dues" icon={Clock} tone={account?.library_dues?.length ? 'warning' : 'default'}>
            <div className="space-y-2 text-sm">
              {(account?.holds ?? []).map((h, i) => (
                <div key={i} className="rounded-xl border border-border/70 bg-white px-3 py-2">
                  {h.title} — {h.status} (queue #{h.queue_position})
                </div>
              ))}
              {!account?.holds?.length && <p className="text-muted-foreground">No active holds.</p>}
              {(account?.library_dues ?? []).map((d, i) => (
                <div key={i} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700">
                  {d.fee_head}: ₹{Number(d.total_amount).toLocaleString()} ({d.status})
                </div>
              ))}
            </div>
          </StudentSectionCard>

          <StudentSectionCard title="Reading history" description="Recently returned titles" icon={Clock}>
            {(account?.history ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No reading history yet.</p>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                {(account?.history ?? []).map((h, i) => (
                  <div key={i} className="rounded-xl border border-border/70 bg-white px-3 py-2">
                    {h.title} — returned {new Date(h.returned_at).toLocaleDateString()}
                  </div>
                ))}
              </div>
            )}
          </StudentSectionCard>
        </div>
      )}

      {tab === 'digital' && (
        <div className="space-y-4">
          {digital.length === 0 ? (
            <StudentEmptyState icon={ExternalLink} title="No digital resources" description="E-resources will appear when configured by the library." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {digital.map((r) => (
                <article
                  key={r.resource_id}
                  className="rounded-2xl border border-border/70 bg-white p-5 shadow-sm transition hover:border-sgvu-gold/40 hover:shadow-md"
                >
                  <p className="font-semibold text-sgvu-navy">{r.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.resource_type} · {r.category}
                  </p>
                  <a
                    href={r.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sgvu-navy/20 px-3 py-2 text-sm font-semibold text-sgvu-navy transition hover:bg-sgvu-navy/5"
                  >
                    Open in browser
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
