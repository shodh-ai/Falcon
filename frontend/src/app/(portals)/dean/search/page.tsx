'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  deanSearchResultHref,
  type DeanSearchResult,
} from '@/lib/dean-search-links';

type SearchPayload = {
  students: DeanSearchResult[];
  faculty: DeanSearchResult[];
  departments: DeanSearchResult[];
  courses: DeanSearchResult[];
  research: DeanSearchResult[];
  events: DeanSearchResult[];
  meetings: DeanSearchResult[];
  approvals: DeanSearchResult[];
};

const SECTIONS: Array<{ key: keyof SearchPayload; label: string }> = [
  { key: 'students', label: 'Students' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'departments', label: 'Departments' },
  { key: 'courses', label: 'Courses' },
  { key: 'research', label: 'Research Projects' },
  { key: 'events', label: 'Events' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'approvals', label: 'Approvals' },
];

function SearchResultRow({ row }: { row: DeanSearchResult }) {
  const href = deanSearchResultHref(row);
  const content = (
    <>
      <p className="font-medium text-sgvu-navy">{row.name}</p>
      <p className="text-muted-foreground">{row.subtitle}</p>
    </>
  );

  if (!href) {
    return (
      <li className="rounded-lg border border-slate-100 p-3">{content}</li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        className="block rounded-lg border border-slate-100 p-3 transition hover:border-sgvu-navy/30 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy"
      >
        {content}
      </Link>
    </li>
  );
}

export default function DeanSearchPage() {
  const api = useAuthedApi();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchPayload | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const data = await api.get<SearchPayload>(
            `/api/academics/dean/intelligence/search?q=${encodeURIComponent(query.trim())}`,
          );
          setResults(data);
        } catch {
          setResults(null);
          toast.error('Search failed. Please try again.');
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [api, query]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Global Search"
        description="Search students, faculty, departments, courses, research, events, meetings, and approvals across your school."
        workspaceLabel="Dean Workspace"
      />

      <div className="relative max-w-2xl">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          className="w-full rounded-xl border bg-white py-3 pl-10 pr-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy"
          placeholder="Search across your school…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search across your school"
        />
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…
        </p>
      ) : null}

      {results ? (
        <div className="grid gap-4 md:grid-cols-2">
          {SECTIONS.map((section) => {
            const rows = results[section.key] ?? [];
            return (
              <HodPanel key={section.key} title={section.label}>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matches.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {rows.map((row) => (
                      <SearchResultRow key={`${section.key}-${row.id}`} row={row} />
                    ))}
                  </ul>
                )}
              </HodPanel>
            );
          })}
        </div>
      ) : null}
    </HodPageFrame>
  );
}
