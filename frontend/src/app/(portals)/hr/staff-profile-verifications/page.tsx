'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Row = {
  review_id: string | null; user_id: string; name: string; official_email: string;
  role_name: string; dept_id: number; dept_name: string; status: string;
  onboarding_status: string; source: string;
};
type Detail = {
  review: Omit<Row, 'review_id'> & { review_id: string; return_reason: string | null };
  profile: Record<string, unknown>;
  documents: Array<{ doc_type: string; file_path: string; status: string }>;
  events: Array<{ event_type: string; occurred_at: string; reason: string | null }>;
};
type Preview = {
  department: { dept_id: number; dept_name: string };
  accounts: Array<{ user_id: string; name: string; official_email: string; onboarding_status: string }>;
  preview_hash: string;
};

export default function StaffProfileVerificationsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [backupReference, setBackupReference] = useState('');
  const [confirmCohort, setConfirmCohort] = useState(false);
  const [batchKey, setBatchKey] = useState('');
  const [pharmacyDepartments, setPharmacyDepartments] = useState<Array<{
    dept_id: number; dept_name: string; school_name: string;
  }>>([]);
  const canDecide = [...(user?.roles ?? []), user?.role ?? ''].includes('HRAdmin');
  const isSuperAdmin = [...(user?.roles ?? []), user?.role ?? ''].includes('SuperAdmin');

  const load = useCallback(async () => {
    try {
      const query = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : '';
      setRows(await api.get<Row[]>(`/api/hr/staff-profile-reviews${query}`));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load HR reviews.');
    }
  }, [api, departmentId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!isSuperAdmin) return;
    void api.get<Array<{ dept_id: number; dept_name: string; school_name: string }>>(
      '/api/hr/staff-profile-reviews/pharmacy/departments',
    ).then(setPharmacyDepartments).catch(() => undefined);
  }, [api, isSuperAdmin]);

  const open = async (id: string) => {
    try {
      setSelected(await api.get<Detail>(`/api/hr/staff-profile-reviews/${id}`));
      setReason(''); setFields([]); setDocuments([]); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load profile.');
    }
  };

  const decide = async (action: 'approve' | 'return') => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/api/hr/staff-profile-reviews/${selected.review.review_id}/${action}`,
        action === 'return' ? { reason, fields, documents } : undefined);
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save HR decision.');
    } finally { setBusy(false); }
  };

  const previewDocument = async (docType: string) => {
    if (!selected) return;
    try {
      const blob = await api.getBlob(`/api/staff/verifications/${selected.review.user_id}/documents/${docType}/preview`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open document.');
    }
  };

  const toggle = (current: string[], set: (value: string[]) => void, item: string) =>
    set(current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);

  const previewPharmacy = async () => {
    try {
      const result = await api.get<Preview>(
        `/api/hr/staff-profile-reviews/pharmacy/preview?department_id=${encodeURIComponent(departmentId)}`,
      );
      setPreview(result);
      setBatchKey(crypto.randomUUID());
      setConfirmCohort(false);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not preview Pharmacy accounts.');
    }
  };

  const applyPharmacy = async () => {
    if (!preview || !confirmCohort || !backupReference.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/hr/staff-profile-reviews/pharmacy/reopen', {
        department_id: preview.department.dept_id,
        preview_hash: preview.preview_hash,
        backup_reference: backupReference.trim(),
      }, { 'Idempotency-Key': batchKey });
      setPreview(null);
      setConfirmCohort(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reopen Pharmacy reviews.');
    } finally { setBusy(false); }
  };

  const profileFields = selected ? Object.entries(selected.profile).flatMap(([key, value]) =>
    key === 'qualification' && value && typeof value === 'object'
      ? Object.entries(value as Record<string, unknown>)
      : [[key, value]] as [string, unknown][]) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Staff profile verification</h1>
        <p className="text-sm text-muted-foreground">HR makes the final decision. Campus Admin can view, but not approve, staff profiles.</p>
      </header>
      <label className="block max-w-xs text-sm">Department ID filter
        <Input value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPreview(null); }}
          type="number" min="1" placeholder="All departments" />
      </label>
      {canDecide && <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          await api.post('/api/hr/staff-profile-reviews/sync-submitted');
          await load();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not import submitted staff.');
        } finally { setBusy(false); }
      }}>Import existing submitted staff into HR queue</Button>}
      {isSuperAdmin && <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h2 className="font-semibold">One-time Pharmacy HR recheck</h2>
        <p className="text-sm">Choose the exact Pharmacy department. Preview every account before reopening. This freezes previously approved staff until HR Admin decides.</p>
        <label className="block text-sm">Pharmacy department
          <select className="mt-1 block w-full max-w-md rounded border bg-white p-2" value={departmentId}
            onChange={(event) => { setDepartmentId(event.target.value); setPreview(null); }}>
            <option value="">Select department</option>
            {pharmacyDepartments.map((department) => <option key={department.dept_id} value={department.dept_id}>
              {department.dept_name} · {department.school_name} (ID {department.dept_id})
            </option>)}
          </select>
        </label>
        <Button variant="outline" disabled={!departmentId || busy} onClick={() => void previewPharmacy()}>Preview exact accounts</Button>
        {preview && <div className="space-y-3 text-sm">
          <p><strong>{preview.department.dept_name}</strong>: {preview.accounts.length} active staff · hash {preview.preview_hash}</p>
          <ul className="max-h-48 overflow-auto rounded border bg-white p-2">
            {preview.accounts.map((account) => <li key={account.user_id} className="border-b py-1 last:border-0">
              {account.name} · {account.official_email} · {account.onboarding_status}
            </li>)}
          </ul>
          <label className="block">Verified production database backup reference
            <Input value={backupReference} onChange={(event) => setBackupReference(event.target.value)}
              placeholder="Backup/snapshot identifier" />
          </label>
          <p className="text-xs text-amber-900">Enter an independently verified, restorable database snapshot reference. Falcon’s Admin Control metadata backup is not a database backup.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmCohort} onChange={(event) => setConfirmCohort(event.target.checked)} />
            I checked the exact account list and confirmed the database backup can be restored.
          </label>
          <Button disabled={!confirmCohort || !backupReference.trim() || busy || preview.accounts.length === 0}
            onClick={() => void applyPharmacy()}>Reopen these profiles for HR</Button>
        </div>}
      </section>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(260px,1fr)_minmax(400px,2fr)]">
        <section className="space-y-2" aria-label="HR review queue">
          {rows.length === 0 && <p className="rounded border p-4 text-sm">No staff profiles in this queue.</p>}
          {rows.map((row) => (
            <button key={row.review_id ?? row.user_id} type="button" disabled={!row.review_id}
              onClick={() => row.review_id && void open(row.review_id)}
              className="block w-full rounded-lg border bg-white p-4 text-left hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-70">
              <strong>{row.name}</strong> <span className="text-xs text-muted-foreground">{row.role_name}</span>
              <p className="text-xs">{row.official_email}</p>
              <p className="text-xs">{row.dept_name} · {row.status === 'AWAITING_SUBMISSION' ? 'Staff has not submitted the profile yet' : row.status}</p>
            </button>
          ))}
        </section>
        <section className="rounded-lg border bg-white p-5" aria-label="Selected staff profile">
          {!selected ? <p>Select a staff profile to review.</p> : <>
            <h2 className="text-xl font-semibold">{selected.review.name}</h2>
            <p className="text-sm text-muted-foreground">{selected.review.official_email} · {selected.review.dept_name}</p>
            <p className="mt-2 text-xs">Onboarding: {selected.review.onboarding_status} · HR: {selected.review.status}</p>
            <h3 className="mt-5 font-semibold">Submitted profile</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {profileFields.map(([field, value]) => (
                <div key={field} className="rounded border p-2">
                  <dt className="font-medium">{field.replaceAll('_', ' ')}</dt>
                  <dd className="break-words">{String(value ?? '—')}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-5 font-semibold">Original submitted documents</h3>
            <div className="mt-2 space-y-2">
              {selected.documents.map((doc) => (
                <div key={doc.doc_type} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span>{doc.doc_type} · {doc.status}</span>
                  <Button size="sm" variant="outline" onClick={() => void previewDocument(doc.doc_type)}>Preview</Button>
                </div>
              ))}
            </div>
            {selected.events.length > 0 && <p className="mt-4 text-xs text-muted-foreground">
              {selected.events.length} immutable review event(s) retained.
            </p>}
            {canDecide && selected.review.status === 'PENDING_HR' && <div className="mt-6 space-y-3 border-t pt-5">
              <Button disabled={busy} onClick={() => void decide('approve')}>Approve profile as HR Admin</Button>
              <div className="space-y-2 rounded-lg bg-amber-50 p-3">
                <p className="font-medium">Return specific corrections</p>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required reason" />
                <div className="grid gap-1 sm:grid-cols-2">
                  {profileFields.map(([field]) => <label key={field} className="text-xs">
                    <input type="checkbox" checked={fields.includes(field)} onChange={() => toggle(fields, setFields, field)} /> {field}
                  </label>)}
                  {selected.documents.map((doc) => <label key={doc.doc_type} className="text-xs">
                    <input type="checkbox" checked={documents.includes(doc.doc_type)} onChange={() => toggle(documents, setDocuments, doc.doc_type)} /> {doc.doc_type} document
                  </label>)}
                </div>
                <Button variant="outline" disabled={busy || !reason.trim() || (!fields.length && !documents.length)}
                  onClick={() => void decide('return')}>Return for correction</Button>
              </div>
            </div>}
          </>}
        </section>
      </div>
    </div>
  );
}
