'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Search, Ticket, UserRound } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useAuthedApi } from '@/lib/api';
import { profile360Path } from '@/lib/directory-routes';

type SearchItem = {
  id: string;
  name: string;
  avatar: string | null;
  subtitle: string;
};

type TicketItem = {
  id: string;
  title: string;
  status: string;
  ticket_ref?: string;
};

type SearchResponse = {
  students: SearchItem[];
  staff: SearchItem[];
  tickets: TicketItem[];
  direct_jump?: { type: 'ticket'; path: string };
};

const EXACT_TICKET = /^TKT-\d+$/i;
const DEBOUNCE_MS = 300;

export function UniversalSearchOmnibar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const router = useRouter();
  const api = useAuthedApi();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQ('');
      setResults(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedQ(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const q = debouncedQ;
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void api
      .get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults({ students: [], staff: [], tickets: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQ, open, api]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const runSearch = useCallback(
    async (q: string): Promise<SearchResponse> => {
      return api.get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`);
    },
    [api],
  );

  const handleEnter = async () => {
    const q = query.trim();
    if (q.length < 2) return;

    if (EXACT_TICKET.test(q)) {
      try {
        const data = await runSearch(q);
        if (data.direct_jump?.path) {
          navigate(data.direct_jump.path);
          return;
        }
        const ticket = data.tickets[0];
        if (ticket?.ticket_ref) {
          navigate(`/tickets/view/${ticket.ticket_ref}`);
          return;
        }
      } catch {
        /* fall through */
      }
    }

    if (!results) return;
    const first = results.students[0] ?? results.staff[0] ?? results.tickets[0];
    if (!first) return;

    if ('ticket_ref' in first || ('title' in first && 'status' in first)) {
      const t = first as TicketItem;
      navigate(`/tickets/view/${t.ticket_ref ?? t.id}`);
    } else {
      navigate(profile360Path((first as SearchItem).id));
    }
  };

  const emptyMessage =
    loading
      ? 'Searching…'
      : debouncedQ.length < 2
        ? 'Type at least 2 characters — try a name, SGVU- ID, EMP- ID, or TKT- ticket'
        : `No results for "${debouncedQ}"`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 min-w-[9rem] items-center gap-2 rounded-xl border border-sgvu-navy/12 bg-white px-3 text-sm text-muted-foreground shadow-sm transition hover:border-sgvu-gold/40 hover:text-sgvu-navy sm:flex lg:min-w-[11rem]"
        aria-label="Open search (Cmd+K)"
      >
        <Search className="h-4 w-4 shrink-0 text-sgvu-navy/50" />
        <span className="truncate">Search…</span>
        <kbd className="ml-auto hidden rounded border border-sgvu-navy/10 bg-sgvu-surface px-1.5 py-0.5 text-[10px] font-medium lg:inline">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-sgvu-navy/12 bg-white text-sgvu-navy shadow-sm transition hover:border-sgvu-gold/40 sm:hidden"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search students, staff, or tickets…"
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleEnter();
          }}
        />
        <CommandList className="max-h-[min(60vh,420px)]">
          <CommandEmpty>{emptyMessage}</CommandEmpty>

          {results && results.students.length > 0 ? (
            <CommandGroup heading="Students">
              {results.students.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${s.subtitle}`}
                  onSelect={() => navigate(profile360Path(s.id))}
                  className="cursor-pointer"
                >
                  <GraduationCap className="h-4 w-4 text-sgvu-gold" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.subtitle}</span>
                  </div>
                  <CommandShortcut>360°</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {results && results.staff.length > 0 ? (
            <CommandGroup heading="Staff">
              {results.staff.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${s.subtitle}`}
                  onSelect={() => navigate(profile360Path(s.id))}
                  className="cursor-pointer"
                >
                  <UserRound className="h-4 w-4 text-sgvu-navy" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{s.subtitle}</span>
                  </div>
                  <CommandShortcut>360°</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {results && results.tickets.length > 0 ? (
            <CommandGroup heading="Issues">
              {results.tickets.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.title}
                  onSelect={() => navigate(`/tickets/view/${t.ticket_ref ?? t.id}`)}
                  className="cursor-pointer"
                >
                  <Ticket className="h-4 w-4 text-sgvu-navy" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{t.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{t.status}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
