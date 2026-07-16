'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type SearchResult = {
  students: Array<{ user_id: string; name: string; enrollment_number: string | null; prn_number: string | null }>;
  schedules: Array<{ exam_schedule_id: string; exam_type: string; exam_date: string; venue: string; subject_name: string; subject_code: string }>;
  subjects: Array<{ subject_id: number; subject_code: string; subject_name: string }>;
  answer_sheets: Array<{ sheet_id: string; sheet_number: string; status: string; qr_payload: string }>;
  hall_tickets: Array<{ entry_id: string; name: string; enrollment_number: string | null; eligible: boolean; created_at: string }>;
};

export default function ExamCellSearchPage() {
  const api = useAuthedApi();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) {
      toast.error('Enter a search term');
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<SearchResult>(`/api/exam-cell/search?q=${encodeURIComponent(query.trim())}`);
      setResults(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="search" />

      <Card>
        <CardContent className="flex gap-2 pt-6">
          <Input
            placeholder="Student, enrollment, PRN, subject, room, hall ticket, answer sheet #, QR…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
          />
          <Button onClick={() => void search()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {results ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Students ({results.students.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {results.students.length === 0 ? <p className="text-xs text-muted-foreground">No matches</p> : results.students.map((s) => (
                <Link key={s.user_id} href={`/exam-cell/student-timeline?student=${s.user_id}`} className="block rounded border px-2 py-1.5 text-sm hover:border-sgvu-gold/40">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.enrollment_number ?? s.prn_number ?? '—'}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Exam schedules ({results.schedules.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {results.schedules.length === 0 ? <p className="text-xs text-muted-foreground">No matches</p> : results.schedules.map((s) => (
                <div key={s.exam_schedule_id} className="rounded border px-2 py-1.5 text-sm">
                  <p className="font-medium">{s.subject_name ?? s.exam_type}</p>
                  <p className="text-xs text-muted-foreground">{s.exam_date} · {s.venue}</p>
                  <Link href="/exam-cell/schedule" className="text-xs text-sgvu-gold hover:underline">View schedule →</Link>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Subjects ({results.subjects.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {results.subjects.length === 0 ? <p className="text-xs text-muted-foreground">No matches</p> : results.subjects.map((s) => (
                <div key={s.subject_id} className="rounded border px-2 py-1.5 text-sm">
                  <p className="font-medium">{s.subject_code}</p>
                  <p className="text-xs text-muted-foreground">{s.subject_name}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Hall tickets ({results.hall_tickets?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(results.hall_tickets ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No matches</p> : results.hall_tickets.map((h) => (
                <div key={h.entry_id} className="rounded border px-2 py-1.5 text-sm">
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.enrollment_number ?? '—'} · {h.eligible ? 'Eligible' : 'Blocked'}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Answer sheets ({results.answer_sheets?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(results.answer_sheets ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No matches</p> : results.answer_sheets.map((a) => (
                <Link key={a.sheet_id} href="/exam-cell/answer-sheets" className="block rounded border px-2 py-1.5 text-sm hover:border-sgvu-gold/40">
                  <p className="font-medium font-mono">{a.sheet_number}</p>
                  <p className="text-xs text-muted-foreground">{a.status}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
