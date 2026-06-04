'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Patron = {
  user_id: string;
  name: string;
  official_email: string;
  role_name: string;
  borrowing_rules: { max_books_allowed: number; max_days_allowed: number; fine_per_day: number };
  currently_issued: number;
};

export default function LibraryCirculationPage() {
  const api = useAuthedApi();
  const patronRef = useRef<HTMLInputElement>(null);
  const bookRef = useRef<HTMLInputElement>(null);
  const returnRef = useRef<HTMLInputElement>(null);

  const [patron, setPatron] = useState<Patron | null>(null);
  const [lastIssue, setLastIssue] = useState<{ book_title: string; due_date: string } | null>(null);
  const [lastReturn, setLastReturn] = useState<{ book_title: string; fine_amount: number; days_late: number } | null>(null);

  useEffect(() => {
    patronRef.current?.focus();
  }, []);

  async function scanPatron(barcode: string) {
    try {
      const p = await api.get<Patron>(`/api/library-admin/patron-lookup?barcode=${encodeURIComponent(barcode)}`);
      setPatron(p);
      toast.success(`Patron: ${p.name}`);
      bookRef.current?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Patron not found');
      setPatron(null);
    }
  }

  async function issueBook(accession: string) {
    if (!patron) {
      toast.error('Scan patron ID first');
      return;
    }
    try {
      const res = await api.post<{ book_title: string; due_date: string }>('/api/library-admin/circulation/issue', {
        user_id: patron.user_id,
        accession_number: accession,
      });
      setLastIssue({ book_title: res.book_title, due_date: res.due_date });
      toast.success(`Issued: ${res.book_title}`);
      if (bookRef.current) bookRef.current.value = '';
      bookRef.current?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Issue failed');
    }
  }

  async function returnBook(accession: string) {
    try {
      const res = await api.post<{ book_title: string; fine_amount: number; days_late: number }>(
        '/api/library-admin/circulation/return',
        { accession_number: accession },
      );
      setLastReturn(res);
      toast.success(
        res.fine_amount > 0
          ? `Returned with fine ₹${res.fine_amount}`
          : `Returned: ${res.book_title}`,
      );
      if (returnRef.current) returnRef.current.value = '';
      returnRef.current?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Return failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Circulation Desk</h1>
      <p className="text-sm text-muted-foreground">
        USB barcode scanners: scan patron ID, then book accession. Fields auto-focus for hands-free workflow.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-sgvu-gold/30">
          <CardHeader>
            <CardTitle className="text-base text-emerald-800">Issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">1. Patron ID / email</label>
              <Input
                ref={patronRef}
                autoFocus
                placeholder="Scan student ID card"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void scanPatron((e.target as HTMLInputElement).value);
                  }
                }}
              />
            </div>
            {patron && (
              <p className="rounded bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                {patron.name} · {patron.official_email}
                <br />
                <span className="text-xs">
                  {patron.role_name} — {patron.currently_issued}/{patron.borrowing_rules.max_books_allowed} books ·{' '}
                  {patron.borrowing_rules.max_days_allowed} day loans
                  {patron.borrowing_rules.fine_per_day > 0
                    ? ` · ₹${patron.borrowing_rules.fine_per_day}/day fine`
                    : ' · no fines'}
                </span>
              </p>
            )}
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">2. Book barcode</label>
              <Input
                ref={bookRef}
                placeholder="Scan accession (e.g. LIB-CC-001)"
                disabled={!patron}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void issueBook((e.target as HTMLInputElement).value);
                  }
                }}
              />
            </div>
            {lastIssue && (
              <p className="text-sm">
                Last issue: <strong>{lastIssue.book_title}</strong> — due{' '}
                {new Date(lastIssue.due_date).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-base text-blue-900">Return</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Book barcode only</label>
            <Input
              ref={returnRef}
              placeholder="Scan accession to return"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void returnBook((e.target as HTMLInputElement).value);
                }
              }}
            />
            {lastReturn && (
              <p className="text-sm">
                {lastReturn.book_title}
                {lastReturn.days_late > 0 && (
                  <span className="text-red-600">
                    {' '}
                    · {lastReturn.days_late} days late · Fine ₹{lastReturn.fine_amount}
                  </span>
                )}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => returnRef.current?.focus()}>
              Focus return scanner
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
