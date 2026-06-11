'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Search, UserRound } from 'lucide-react';
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
import type { NavItem } from '@/lib/navigation';

type SearchHit = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  enrollment_no: string | null;
  employee_id: string | null;
  dept_name: string | null;
};

interface SpotlightSearchProps {
  items: NavItem[];
}

export function SpotlightSearch({ items }: SpotlightSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
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
      setPeople([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setPeople([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      void api
        .get<SearchHit[]>(`/api/search/global?q=${encodeURIComponent(q)}`)
        .then(setPeople)
        .catch(() => setPeople([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, api]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const navItems = useMemo(() => items, [items]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-sgvu-navy/15 bg-white text-sgvu-navy shadow-sm transition hover:border-sgvu-gold/50 hover:text-sgvu-gold touch-target"
        aria-label="Global search (Cmd+K)"
      >
        <Search className="h-4 w-4" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search by name, enrollment (SGVU-1024), or employee ID…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{searching ? 'Searching…' : query.length < 2 ? 'Type at least 2 characters to search people' : 'No profiles found'}</CommandEmpty>

          {people.length > 0 ? (
            <CommandGroup heading="People">
              {people.map((person) => {
                const sub = person.enrollment_no ?? person.employee_id ?? person.dept_name ?? person.role_name;
                const isStudent = person.role_name.toLowerCase() === 'student';
                return (
                  <CommandItem
                    key={person.user_id}
                    value={`${person.name} ${person.email} ${sub ?? ''}`}
                    onSelect={() => navigate(profile360Path(person.user_id))}
                    className="cursor-pointer"
                  >
                    {isStudent ? (
                      <GraduationCap className="h-4 w-4 text-sgvu-gold" />
                    ) : (
                      <UserRound className="h-4 w-4 text-sgvu-navy" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{person.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{sub}</span>
                    </div>
                    <CommandShortcut>360°</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          <CommandGroup heading="Jump to">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                  onSelect={() => navigate(item.href)}
                  className="cursor-pointer"
                >
                  <Icon className="h-4 w-4 text-sgvu-gold" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
