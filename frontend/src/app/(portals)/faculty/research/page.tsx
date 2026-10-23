'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
import { calendarDateKey, formatCalendarDate } from '@/lib/faculty/calendar-date';
import { FacultyResearchDocuments } from '@/components/faculty/FacultyResearchDocuments';

type ResearchLog = {
  research_id: string;
  publication_title: string;
  journal_name: string | null;
  indexing_type: string | null;
  publication_type: string;
  published_date: string | null;
  proof_file_path?: string | null;
};

const EMPTY_FORM = { publication_title: '', journal_name: '', indexing_type: 'SCOPUS', publication_type: 'JOURNAL', published_date: '' };

export default function FacultyResearchPage() {
  const api = useAuthedApi();
  const [logs, setLogs] = useState<ResearchLog[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const mounted = useRef(false);
  const activeApi = useRef(api);
  const [loadedApi, setLoadedApi] = useState(() => api);
  const saving = useRef(false);
  const loadRequest = useRef(0);
  const proofInput = useRef<HTMLInputElement>(null);
  const uploadedProof = useRef<{ file: File; path: string; api: typeof api } | null>(null);
  const unavailable = submitting || loading || Boolean(loadError) || loadedApi !== api;

  const clearDraft = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setProofFile(null);
    uploadedProof.current = null;
    if (proofInput.current) proofInput.current.value = '';
  }, []);

  const load = useCallback(async (afterSave = false) => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.get<ResearchLog[]>('/api/academics/faculty/workspaces/research');
      if (!mounted.current || activeApi.current !== api || requestId !== loadRequest.current) return;
      if (!Array.isArray(rows)) throw new Error('Could not read publications');
      setLoadedApi(api);
      setLogs(withFacultyDemoFallback(rows, facultyDemoResearch(), isEmptyArray));
    } catch (error) {
      if (!mounted.current || activeApi.current !== api || requestId !== loadRequest.current) return;
      const fallback = withFacultyDemoFallback([], facultyDemoResearch(), isEmptyArray);
      if (fallback.length) { setLoadedApi(api); setLogs(fallback); }
      else {
        const message = error instanceof Error ? error.message : 'Could not load publications';
        setLoadError(afterSave ? `Publication saved, but the list could not be refreshed. ${message}` : message);
      }
    } finally {
      if (mounted.current && activeApi.current === api && requestId === loadRequest.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    activeApi.current = api;
    saving.current = false;
    // Clear the previous account's private draft before loading this account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitting(false);
    setLogs([]);
    clearDraft();
    void load();
    return () => { mounted.current = false; loadRequest.current += 1; };
  }, [api, clearDraft, load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving.current || unavailable) return;
    if (!form.publication_title.trim()) {
      toast.error('Enter a publication title');
      return;
    }
    if (form.published_date && calendarDateKey(form.published_date) !== form.published_date) {
      toast.error('Enter a valid publication date');
      return;
    }
    saving.current = true;
    setSubmitting(true);
    const payload = { ...form, publication_title: form.publication_title.trim(), journal_name: form.journal_name.trim(), published_date: form.published_date || undefined };
    const demoOnly =
      isFacultyDemoModeEnabled() &&
      (logs.length === 0 || logs.every((l) => isFacultyDemoEntityId(l.research_id)));
    if (demoOnly) {
      setLogs((prev) => [
        {
          research_id: `res-${Date.now()}`,
          publication_title: payload.publication_title,
          journal_name: payload.journal_name || null,
          indexing_type: form.indexing_type || null,
          publication_type: form.publication_type,
          published_date: form.published_date || null,
          proof_file_path: proofFile ? 'demo://proof' : null,
        },
        ...prev,
      ]);
      toast.success('Research entry logged (demo)');
      clearDraft();
      saving.current = false;
      setSubmitting(false);
      return;
    }
    try {
      let proof_file_path: string | undefined;
      if (proofFile) {
        if (uploadedProof.current?.file === proofFile && uploadedProof.current.api === api) proof_file_path = uploadedProof.current.path;
        else {
          const fd = new FormData();
          fd.append('file', proofFile);
          const uploaded = await api.post<{ url?: string; path?: string }>('/api/uploads/single', fd);
          if (!mounted.current || activeApi.current !== api) return;
          proof_file_path = [uploaded?.url, uploaded?.path].find((value) => typeof value === 'string' && value.trim())?.trim();
          if (!proof_file_path) throw new Error('Proof upload returned no file location. Please retry.');
          uploadedProof.current = { file: proofFile, path: proof_file_path, api };
        }
      }
      const created = await api.post<ResearchLog>('/api/academics/faculty/workspaces/research', {
        ...payload,
        proof_file_path,
      });
      if (!mounted.current || activeApi.current !== api) return;
      toast.success('Research entry logged (feeds HR PMS & IQAC)');
      setLogs((current) => [created, ...current.filter((row) => row.research_id !== created.research_id)]);
      clearDraft();
      await load(true);
    } catch (err) {
      if (mounted.current && activeApi.current === api) toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      if (activeApi.current === api) { saving.current = false; if (mounted.current) setSubmitting(false); }
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Research"
        description="Manage publications, research projects, and academic contributions."
        meta={!loading && !loadError ? <FacultyMetricChip label="Publications" value={logs.length} emphasis /> : null}
      />

      <FacultyPanel title="Add publication" description="Journal, conference, patent, or book chapter">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <Input
            required
            disabled={unavailable}
            className="sm:col-span-2"
            value={form.publication_title}
            onChange={(e) => setForm({ ...form, publication_title: e.target.value })}
            placeholder="Publication title"
          />
          <Input
            disabled={unavailable}
            value={form.journal_name}
            onChange={(e) => setForm({ ...form, journal_name: e.target.value })}
            placeholder="Journal / conference"
          />
          <Select
            disabled={unavailable}
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
            disabled={unavailable}
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
            aria-label="Publication date"
            disabled={unavailable}
            value={form.published_date}
            onChange={(e) => setForm({ ...form, published_date: e.target.value })}
          />
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Proof document (optional PDF/image)
            </label>
            <Input
              type="file"
              aria-label="Proof document"
              ref={proofInput}
              disabled={unavailable}
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
              onChange={(e) => { setProofFile(e.target.files?.[0] ?? null); uploadedProof.current = null; }}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={unavailable} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {submitting ? 'Saving…' : 'Save to research log'}
            </Button>
          </div>
        </form>
      </FacultyPanel>

      <FacultyPanel title="Your publications" count={logs.length}>
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading publications…</p> : loadError ? (
          <div role="alert" className="space-y-2 text-sm text-destructive"><p>{loadError}</p><Button variant="outline" disabled={submitting} onClick={() => void load()}>Retry publications</Button></div>
        ) : logs.length === 0 ? (
          <FacultyEmptyState description="No publications logged yet." />
        ) : null}
        {!loading && logs.length > 0 ? (
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
                        {formatCalendarDate(l.published_date)}
                      </Badge>
                    ) : null}
                    {l.proof_file_path ? (
                      <Badge variant="outline" className="text-[10px]">
                        Proof attached
                      </Badge>
                    ) : null}
                  </div>
                  {l.proof_file_path ? <div className="mt-3"><FacultyResearchDocuments documents={{ 'publication proof': l.proof_file_path }} documentScope={l.research_id} /></div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </FacultyPanel>
    </FacultyPageShell>
  );
}
