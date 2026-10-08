'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FlaskConical, Plus } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { Select } from '@/components/ui/select';
import {
  isEmptyArray,
  isFacultyDemoEntityId,
  isFacultyDemoModeEnabled,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoResearch } from '@/lib/mock/faculty-portal-demo';

type ResearchLog = {
  research_id: string;
  publication_title: string;
  journal_name: string | null;
  indexing_type: string | null;
  publication_type: string;
  published_date: string | null;
  proof_file_path?: string | null;
};

export default function FacultyResearchPage() {
  const api = useAuthedApi();
  const [logs, setLogs] = useState<ResearchLog[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    publication_title: '',
    journal_name: '',
    indexing_type: 'SCOPUS',
    publication_type: 'JOURNAL',
    published_date: '',
  });

  useEffect(() => {
    void api
      .get<ResearchLog[]>('/api/academics/faculty/workspaces/research')
      .then((rows) => setLogs(withFacultyDemoFallback(rows, facultyDemoResearch(), isEmptyArray)))
      .catch(() => setLogs(withFacultyDemoFallback([], facultyDemoResearch(), isEmptyArray)));
  }, [api]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const demoOnly =
      isFacultyDemoModeEnabled() &&
      (logs.length === 0 || logs.every((l) => isFacultyDemoEntityId(l.research_id)));
    if (demoOnly) {
      setLogs((prev) => [
        {
          research_id: `res-${Date.now()}`,
          publication_title: form.publication_title,
          journal_name: form.journal_name || null,
          indexing_type: form.indexing_type || null,
          publication_type: form.publication_type,
          published_date: form.published_date || null,
          proof_file_path: proofFile ? 'demo://proof' : null,
        },
        ...prev,
      ]);
      toast.success('Research entry logged (demo)');
      setForm({
        publication_title: '',
        journal_name: '',
        indexing_type: 'SCOPUS',
        publication_type: 'JOURNAL',
        published_date: '',
      });
      setProofFile(null);
      return;
    }
    setSubmitting(true);
    try {
      let proof_file_path: string | undefined;
      if (proofFile) {
        const fd = new FormData();
        fd.append('file', proofFile);
        const uploaded = await api.post<{ url?: string; path?: string }>(
          '/api/uploads/single',
          fd,
        );
        proof_file_path = uploaded.url ?? uploaded.path;
      }
      await api.post('/api/academics/faculty/workspaces/research', {
        ...form,
        proof_file_path,
      });
      toast.success('Research entry logged (feeds HR PMS & IQAC)');
      setLogs(await api.get<ResearchLog[]>('/api/academics/faculty/workspaces/research'));
      setForm({
        publication_title: '',
        journal_name: '',
        indexing_type: 'SCOPUS',
        publication_type: 'JOURNAL',
        published_date: '',
      });
      setProofFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Research"
        description="Manage publications, research projects, and academic contributions."
        meta={<FacultyMetricChip label="Publications" value={logs.length} emphasis />}
      />

      <FacultyPanel title="Add publication" description="Journal, conference, patent, or book chapter">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <Input
            required
            className="sm:col-span-2"
            value={form.publication_title}
            onChange={(e) => setForm({ ...form, publication_title: e.target.value })}
            placeholder="Publication title"
          />
          <Input
            value={form.journal_name}
            onChange={(e) => setForm({ ...form, journal_name: e.target.value })}
            placeholder="Journal / conference"
          />
          <Select
            className="rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            value={form.indexing_type}
            onChange={(e) => setForm({ ...form, indexing_type: e.target.value })}
          >
            <option value="SCOPUS">Scopus</option>
            <option value="WOS">Web of Science</option>
            <option value="UGC_CARE">UGC-CARE</option>
            <option value="OTHER">Other</option>
          </Select>
          <Select
            className="rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            value={form.publication_type}
            onChange={(e) => setForm({ ...form, publication_type: e.target.value })}
          >
            <option value="JOURNAL">Journal</option>
            <option value="CONFERENCE">Conference</option>
            <option value="PATENT">Patent</option>
            <option value="BOOK">Book</option>
            <option value="BOOK_CHAPTER">Book chapter</option>
          </Select>
          <Input
            type="date"
            value={form.published_date}
            onChange={(e) => setForm({ ...form, published_date: e.target.value })}
          />
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Proof document (optional PDF/image)
            </label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {submitting ? 'Saving…' : 'Save to research log'}
            </Button>
          </div>
        </form>
      </FacultyPanel>

      <FacultyPanel title="Your publications" count={logs.length}>
        {logs.length === 0 ? (
          <FacultyEmptyState description="No publications logged yet." />
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <div
                key={l.research_id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
              >
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                <div>
                  <p className="font-medium text-sgvu-navy">{l.publication_title}</p>
                  <p className="text-sm text-muted-foreground">
                    {l.publication_type.replace('_', ' ')} · {l.indexing_type ?? '—'}
                    {l.journal_name ? ` · ${l.journal_name}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {l.published_date ? (
                      <Badge variant="outline" className="text-[10px]">
                        {new Date(l.published_date).toLocaleDateString('en-IN')}
                      </Badge>
                    ) : null}
                    {l.proof_file_path ? (
                      <Badge variant="outline" className="text-[10px]">
                        Proof attached
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FacultyPanel>
    </FacultyPageShell>
  );
}
