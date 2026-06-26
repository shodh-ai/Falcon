'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, ShieldAlert } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  ACCUSED_TYPES,
  CONCERN_TYPES,
  accusedTypeLabel,
  concernStatusLabel,
  concernTypeLabel,
  proofDocHref,
  type SafetyConcern,
} from '@/lib/student-safety';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
type AccusedOption = { user_id: string; name: string; official_email: string | null; dept_name?: string | null };

export function SafetyConcernForm() {
  const api = useAuthedApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SafetyConcern[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accusedOptions, setAccusedOptions] = useState<AccusedOption[]>([]);
  const [form, setForm] = useState({
    concern_type: 'RAGGING',
    accused_type: 'STUDENT',
    accused_user_id: '',
    accused_description: '',
    incident_description: '',
    incident_location: '',
    incident_date: '',
    is_hostel_related: false,
  });
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<SafetyConcern[]>('/api/student-safety/concerns/mine');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open || form.accused_type === 'OTHER') {
      setAccusedOptions([]);
      return;
    }
    void api
      .get<AccusedOption[]>(`/api/student-safety/accused-options?type=${form.accused_type}`)
      .then((data) => setAccusedOptions(Array.isArray(data) ? data : []))
      .catch(() => setAccusedOptions([]));
  }, [api, open, form.accused_type]);

  const hasOpen = rows.some((r) => ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(r.status));

  async function uploadProofs(): Promise<string[]> {
    const urls: string[] = [];
    for (const file of proofFiles) {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await api.post<{ url?: string; path?: string }>('/api/uploads/single', formData);
      const ref = uploaded.url ?? uploaded.path;
      if (ref) urls.push(ref);
    }
    return urls;
  }

  async function submit() {
    if (!form.incident_description.trim()) {
      toast.error('Please describe what happened');
      return;
    }
    if (!form.accused_user_id && !form.accused_description.trim()) {
      toast.error('Select the person involved or describe them');
      return;
    }

    setSubmitting(true);
    try {
      const evidence_urls = proofFiles.length ? await uploadProofs() : [];
      await api.post('/api/student-safety/concerns', {
        concern_type: form.concern_type,
        accused_type: form.accused_type,
        accused_user_id: form.accused_user_id || null,
        accused_description: form.accused_description.trim() || undefined,
        incident_description: form.incident_description.trim(),
        incident_location: form.incident_location.trim() || undefined,
        incident_date: form.incident_date || undefined,
        is_hostel_related: form.is_hostel_related,
        evidence_urls,
      });
      toast.success('Your concern has been submitted confidentially');
      setOpen(false);
      setProofFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      setForm({
        concern_type: 'RAGGING',
        accused_type: 'STUDENT',
        accused_user_id: '',
        accused_description: '',
        incident_description: '',
        incident_location: '',
        incident_date: '',
        is_hostel_related: false,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-sgvu-gold/30 bg-sgvu-gold/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-sgvu-navy">
            <ShieldAlert className="h-5 w-5 text-sgvu-gold" />
            Ragging & Sexual Harassment Concerns
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Report ragging or sexual harassment confidentially. Proof is optional but helps investigation.
            Concerns against faculty are reviewed by the Disciplinary Committee; the faculty member is notified
            officially without revealing your identity to them.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            disabled={hasOpen}
            onClick={() => setOpen((v) => !v)}
          >
            {open && !hasOpen ? 'Cancel' : 'Raise a concern'}
          </Button>
          {hasOpen ? (
            <p className="text-sm text-muted-foreground">
              You already have an active concern under review. You can raise a new one after it is
              resolved or closed.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Use this to report ragging or sexual harassment. Proof is optional.
            </p>
          )}
        </CardContent>
      </Card>

      {open && !hasOpen ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Select
              value={form.concern_type}
              onValueChange={(val) => setForm({ ...form, concern_type: val })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select concern type..." />
              </SelectTrigger>
              <SelectContent>
                {CONCERN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={form.accused_type}
              onValueChange={(val) =>
                setForm({ ...form, accused_type: val, accused_user_id: '', accused_description: '' })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select who you are reporting..." />
              </SelectTrigger>
              <SelectContent>
                {ACCUSED_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {form.accused_type !== 'OTHER' ? (
              <Select
                value={form.accused_user_id || "none"}
                onValueChange={(val) => setForm({ ...form, accused_user_id: val === "none" ? "" : val })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select person (if known)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select person (if known)</SelectItem>
                  {accusedOptions.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name}{u.dept_name ? ` · ${u.dept_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Or describe the person (name, year, hostel block, etc.)"
              value={form.accused_description}
              onChange={(e) => setForm({ ...form, accused_description: e.target.value })}
            />
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={4}
              placeholder="What happened? Include dates, witnesses, and context."
              value={form.incident_description}
              onChange={(e) => setForm({ ...form, incident_description: e.target.value })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder="Location (classroom, hostel, campus…)"
                value={form.incident_location}
                onChange={(e) => setForm({ ...form, incident_location: e.target.value })}
              />
              <input
                type="date"
                className="rounded-lg border px-3 py-2 text-sm"
                value={form.incident_date}
                onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_hostel_related}
                onChange={(e) => setForm({ ...form, is_hostel_related: e.target.checked })}
              />
              This happened in or around the hostel
            </label>
            <div className="space-y-1">
              <label className="text-xs font-medium text-sgvu-navy">Supporting proof (optional)</label>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={PROOF_ACCEPT}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                onChange={(e) => setProofFiles(Array.from(e.target.files ?? []))}
              />
              {proofFiles.map((f) => (
                <p key={f.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Paperclip className="h-3 w-3" /> {f.name}
                </p>
              ))}
            </div>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit confidentially'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your concerns…
        </p>
      ) : rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-sgvu-navy">My concerns</p>
          {rows.map((r) => {
            const evidence = Array.isArray(r.evidence_urls) ? r.evidence_urls : [];
            return (
              <div key={r.concern_id} className="rounded-lg border px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{concernTypeLabel(r.concern_type)}</span>
                  <Badge>{concernStatusLabel(r.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Against {accusedTypeLabel(r.accused_type)}
                  {r.accused_name ? ` · ${r.accused_name}` : ''}
                </p>
                {evidence.map((url) => (
                  <a
                    key={url}
                    href={proofDocHref(url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-xs text-primary underline"
                  >
                    View evidence
                  </a>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
