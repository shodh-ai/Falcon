'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type ResearchLog = {
  research_id: string;
  publication_title: string;
  journal_name: string | null;
  indexing_type: string | null;
  publication_type: string;
  published_date: string | null;
};

export default function FacultyResearchPage() {
  const api = useAuthedApi();
  const [logs, setLogs] = useState<ResearchLog[]>([]);
  const [form, setForm] = useState({
    publication_title: '',
    journal_name: '',
    indexing_type: 'SCOPUS',
    publication_type: 'JOURNAL',
    published_date: '',
  });

  useEffect(() => {
    void api.get<ResearchLog[]>('/api/academics/faculty/workspaces/research').then(setLogs);
  }, [api]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/academics/faculty/workspaces/research', form);
      toast.success('Research entry logged (feeds HR PMS & IQAC)');
      setLogs(await api.get<ResearchLog[]>('/api/academics/faculty/workspaces/research'));
      setForm({ publication_title: '', journal_name: '', indexing_type: 'SCOPUS', publication_type: 'JOURNAL', published_date: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Research & Publications"
        description="Log Scopus papers, patents, and book chapters — data flows to HR appraisals and NAAC SSR."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add publication</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onSubmit}>
            <Input required value={form.publication_title} onChange={(e) => setForm({ ...form, publication_title: e.target.value })} placeholder="Title" />
            <Input value={form.journal_name} onChange={(e) => setForm({ ...form, journal_name: e.target.value })} placeholder="Journal / Conference" />
            <select className="rounded-md border px-3 py-2 text-sm" value={form.indexing_type} onChange={(e) => setForm({ ...form, indexing_type: e.target.value })}>
              <option value="SCOPUS">Scopus</option>
              <option value="WOS">Web of Science</option>
              <option value="UGC_CARE">UGC-CARE</option>
              <option value="OTHER">Other</option>
            </select>
            <select className="rounded-md border px-3 py-2 text-sm" value={form.publication_type} onChange={(e) => setForm({ ...form, publication_type: e.target.value })}>
              <option value="JOURNAL">Journal</option>
              <option value="CONFERENCE">Conference</option>
              <option value="PATENT">Patent</option>
              <option value="BOOK">Book</option>
              <option value="BOOK_CHAPTER">Book chapter</option>
            </select>
            <Input type="date" value={form.published_date} onChange={(e) => setForm({ ...form, published_date: e.target.value })} />
            <Button type="submit">Save to research log</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your publications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {logs.map((l) => (
            <div key={l.research_id} className="rounded-lg border px-3 py-2">
              <p className="font-medium">{l.publication_title}</p>
              <p className="text-muted-foreground">
                {l.publication_type} · {l.indexing_type ?? '—'} · {l.journal_name ?? '—'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
