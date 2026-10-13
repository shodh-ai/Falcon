'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export type FacultyPortfolio = {
  skills: string[];
  work: Array<{
    event_id: string;
    work_type: string;
    title: string;
    description: string | null;
    completed_on: string;
    evidence_url: string | null;
    created_at: string;
    recorded_by_name: string;
  }>;
  history: Array<{
    event_id: string;
    event_type: string;
    skill_keyword: string;
    created_at: string;
    recorded_by_name: string;
  }>;
};

type PortfolioApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
};

const SUGGESTED_SKILLS = [
  'Teaching', 'Curriculum Design', 'Research', 'Laboratory Safety',
  'Clinical Practice', 'Mentoring', 'Data Analysis', 'Academic Leadership',
];
const WORK_TYPES = [
  'TEACHING', 'RESEARCH', 'PUBLICATION', 'TRAINING',
  'SERVICE', 'MENTORING', 'AWARD', 'OTHER',
];

export function FacultyPortfolioPanel({ api, basePath }: { api: PortfolioApi; basePath: string }) {
  const [data, setData] = useState<FacultyPortfolio | null>(null);
  const [keyword, setKeyword] = useState('');
  const [workType, setWorkType] = useState('TEACHING');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<FacultyPortfolio>(basePath);
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load portfolio');
    }
  }, [api, basePath]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addSkill(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const next = await api.post<FacultyPortfolio>(`${basePath}/skills`,
        { keyword: value.trim() }, { 'Idempotency-Key': crypto.randomUUID() });
      setData(next);
      setKeyword('');
      toast.success('Skill added to your growth record');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add skill');
    } finally { setBusy(false); }
  }

  async function removeSkill(value: string) {
    setBusy(true);
    try {
      const next = await api.post<FacultyPortfolio>(`${basePath}/skills/remove`,
        { keyword: value }, { 'Idempotency-Key': crypto.randomUUID() });
      setData(next);
      toast.success('Skill removed from active keywords; history retained');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove skill');
    } finally { setBusy(false); }
  }

  async function addWork() {
    if (!title.trim() || !completedOn) {
      toast.error('Enter a work title and completion date');
      return;
    }
    setBusy(true);
    try {
      const next = await api.post<FacultyPortfolio>(`${basePath}/work`, {
        work_type: workType, title: title.trim(), description: description.trim(),
        completed_on: completedOn, evidence_url: evidenceUrl.trim(),
      }, { 'Idempotency-Key': crypto.randomUUID() });
      setData(next);
      setTitle(''); setDescription(''); setCompletedOn(''); setEvidenceUrl('');
      toast.success('Completed work recorded in your portfolio');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record work');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border/60 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-sgvu-navy">Skill keywords</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keep your expertise current. Faculty and HR can add skills; every change is logged.</p>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {data?.skills.length ? data.skills.map((skill) => (
            <span key={skill} className="inline-flex items-center gap-2 rounded-full border border-sgvu-navy/20 bg-sgvu-navy/5 px-3 py-1 text-sm text-sgvu-navy">
              {skill}
              <button type="button" aria-label={`Remove ${skill}`} disabled={busy}
                onClick={() => void removeSkill(skill)} className="font-bold hover:text-red-700">×</button>
            </span>
          )) : <p className="text-sm text-muted-foreground">No skills recorded yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input aria-label="New skill keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="Add a skill keyword" maxLength={60} className="max-w-sm" />
          <Button type="button" disabled={busy || !keyword.trim()} onClick={() => void addSkill(keyword)}>Add skill</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested skills">
          {SUGGESTED_SKILLS.filter((skill) => !data?.skills.some((active) => active.toLowerCase() === skill.toLowerCase()))
            .map((skill) => <button key={skill} type="button" disabled={busy} onClick={() => void addSkill(skill)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-sgvu-navy hover:text-sgvu-navy">+ {skill}</button>)}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-sgvu-navy">Completed work & growth</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add teaching, research, training, mentoring and service milestones. Entries stay in the audit timeline.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Type
            <Select value={workType} onChange={(e) => setWorkType(e.target.value)} className="mt-1 w-full">
              {WORK_TYPES.map((type) => <option key={type} value={type}>{type[0] + type.slice(1).toLowerCase()}</option>)}
            </Select>
          </label>
          <label className="text-sm">Completed on
            <Input type="date" value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)} className="mt-1" />
          </label>
          <label className="text-sm sm:col-span-2">Work title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180}
              placeholder="What did you complete?" className="mt-1" />
          </label>
          <label className="text-sm sm:col-span-2">Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000}
              placeholder="Outcome, impact, collaborators…" className="mt-1 min-h-20 w-full rounded-md border border-input px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">Evidence link (optional)
            <Input type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://…" className="mt-1" />
          </label>
        </div>
        <Button type="button" className="mt-4" disabled={busy || !title.trim() || !completedOn}
          onClick={() => void addWork()}>Record completed work</Button>
        <ol className="mt-6 space-y-3">
          {data?.work.map((item) => (
            <li key={item.event_id} className="rounded-lg border border-border/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-sgvu-navy">{item.work_type}</span>
                <span className="text-xs text-muted-foreground">{String(item.completed_on).slice(0, 10)}</span>
              </div>
              <p className="mt-1 font-medium">{item.title}</p>
              {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
              {item.evidence_url ? <a href={item.evidence_url} target="_blank" rel="noreferrer"
                className="mt-2 inline-block text-sm text-sgvu-navy underline">View evidence</a> : null}
              <p className="mt-2 text-xs text-muted-foreground">Recorded by {item.recorded_by_name}</p>
            </li>
          ))}
          {data && !data.work.length ? <li className="text-sm text-muted-foreground">No completed work recorded yet.</li> : null}
        </ol>
      </section>

      {data?.history.length ? (
        <section className="rounded-xl border border-border/60 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-sgvu-navy">Skill change history</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {data.history.map((event) => (
              <li key={event.event_id} className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-2">
                <span>{event.event_type === 'SKILL_ADDED' ? 'Added' : 'Removed'} <strong>{event.skill_keyword}</strong></span>
                <span className="text-muted-foreground">{event.recorded_by_name} · {new Date(event.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
