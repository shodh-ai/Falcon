'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
import {
  HEADER_SEARCH_CLASS,
  HEADER_SEARCH_MOBILE_CLASS,
} from '@/components/layout/header-styles';
import type { NavGroup, NavItem } from '@/lib/navigation';
import { isLeadershipRoute, matchLeadershipShortcuts } from '@/lib/leadership-search-index';

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

interface UniversalSearchOmnibarProps {
  navGroups?: NavGroup[];
}

export function UniversalSearchOmnibar({ navGroups = [] }: UniversalSearchOmnibarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const api = useAuthedApi();
  const onLeadership = isLeadershipRoute(pathname);

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

  /** Client-side nav filtering — instant, no API needed */
  const matchedNavGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return navGroups
      .map((group) => {
        const filtered = !q
          ? group.items                                 // show all when empty
          : group.items.filter((item) => {
              if (item.label.toLowerCase().includes(q)) return true;
              if (item.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true;
              return false;
            });
        return { ...group, items: filtered };
      })
      .filter((group) => group.items.length > 0);
  }, [query, navGroups]);

  const hasMatchedNav = matchedNavGroups.some((g) => g.items.length > 0);

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

  const leadershipShortcuts = useMemo(
    () => (onLeadership ? matchLeadershipShortcuts(query) : []),
    [onLeadership, query],
  );

  const hasAnyResults =
    leadershipShortcuts.length > 0 ||
    hasMatchedNav ||
    (results && (results.students.length > 0 || results.staff.length > 0 || results.tickets.length > 0));

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
        className={HEADER_SEARCH_CLASS}
        aria-label="Open search (Cmd+K)"
      >
        <Search className="h-4 w-4 shrink-0 text-sgvu-navy/50" />
        <span className="truncate">{onLeadership ? 'Search CS Budget, defaulters…' : 'Search…'}</span>
        <kbd className="ml-auto hidden rounded border border-sgvu-navy/10 bg-sgvu-surface px-1.5 py-0.5 text-[10px] font-medium lg:inline">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={HEADER_SEARCH_MOBILE_CLASS}
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder={
            onLeadership
              ? 'Executive shortcuts — CS Budget, defaulters, approve PO…'
              : 'Search pages, people, or tickets…'
          }
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleEnter();
          }}
        />
        <CommandList className="max-h-[min(70vh,540px)] overflow-y-auto">
          {!hasAnyResults && <CommandEmpty>{emptyMessage}</CommandEmpty>}

          {leadershipShortcuts.length > 0 ? (
            <CommandGroup heading="Executive shortcuts">
              {leadershipShortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href + item.label}
                    value={`exec-${item.label} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={() => navigate(item.href)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-sgvu-gold" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

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

          {matchedNavGroups.map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`nav-${item.href}-${item.label} ${item.keywords?.join(' ') ?? ''}`}
                    onSelect={() => navigate(item.href)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-sgvu-gold" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{item.label}</span>
                    </div>
                    <CommandShortcut>↵</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
