'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type RecoveryReview = {
  review_id?: string;
  profile?: Record<string, unknown>;
  required_fields?: string[];
  requested_fields?: string[];
  requested_docs?: string[];
  corrected_docs?: string[];
  return_reason?: string | null;
};

const FIELDS: Record<string, string> = {
  staff_mobile: 'Mobile number', gender: 'Gender', date_of_birth: 'Date of birth',
  current_address: 'Current address', emergency_contact_name: 'Emergency contact name',
  emergency_contact_phone: 'Emergency contact phone', degree_level: 'Highest degree level',
  degree_name: 'Degree name', university: 'Awarding university', passing_year: 'Passing year',
  permanent_address: 'Permanent address', blood_group: 'Blood group', pan_number: 'PAN number',
  aadhaar_number: 'Aadhaar number', bank_account_no: 'Bank account number', ifsc_code: 'IFSC code',
  pf_uan: 'PF UAN', specialization: 'Specialization', total_experience_years: 'Teaching experience (years)',
  industry_experience_years: 'Industry experience (years)', orcid_id: 'ORCID ID', scopus_id: 'Scopus ID',
  google_scholar_url: 'Google Scholar URL',
};
const DOCS: Record<string, string> = {
  PHOTO: 'Passport photograph', AADHAAR: 'Aadhaar card', PAN: 'PAN card', HIGHEST_DEGREE: 'Highest degree certificate',
};

export function StaffProfileRecoveryForm({ review, identityLabel, onSubmitted, onSignOut }: {
  review: RecoveryReview; identityLabel?: string; onSubmitted: () => Promise<unknown>; onSignOut: () => void;
}) {
  const api = useAuthedApi();
  const initial = Object.fromEntries(Object.keys(FIELDS).map(key => [key, String(review.profile?.[key] ?? '')]));
  // A status poll must never replace a faculty member's unfinished edits.
  const baseline = useRef(initial);
  const [values, setValues] = useState(initial);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const required = new Set([...(review.required_fields ?? []), ...(review.requested_fields ?? [])]);
  const received = new Set([...(review.corrected_docs ?? []), ...uploaded]);
  const neededDocs = review.requested_docs ?? [];

  const upload = async (type: string, file: File) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.append('file', file);
      await api.post(`/api/staff/profile-review/me/documents/${type}`, form);
      setUploaded(current => [...new Set([...current, type])]);
      setMessage(`${DOCS[type]} received. Complete the form and submit it to HR.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed. Your saved details are unchanged.'); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('');
    if ([...required].some(key => !values[key]?.trim())) {
      setError('Complete the fields marked Required.'); return;
    }
    if (neededDocs.some(type => !received.has(type))) {
      setError('Upload each document marked Replacement required.'); return;
    }
    const changes = Object.fromEntries(Object.keys(FIELDS).filter(key => values[key].trim() !== baseline.current[key].trim())
      .map(key => [key, values[key].trim()]));
    if (Object.values(changes).some(value => !value)) {
      setError('Saved information cannot be erased here. Restore the value or ask HR to correct it.'); return;
    }
    setBusy(true);
    try {
      if (Object.keys(changes).length) {
        await api.patch('/api/staff/profile-review/me/corrections', changes);
        baseline.current = { ...values };
      }
      await api.post('/api/staff/profile-review/me/resubmit');
      await onSubmitted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit. Your saved details and successful uploads are retained.'); }
    finally { setBusy(false); }
  };
  const field = (key: string) => <label key={key} className="block text-sm font-medium text-slate-800">
    {FIELDS[key]} <span className="text-xs text-slate-500">{required.has(key) ? '(Required)' : '(Optional)'}</span>
    <Input className="mt-1" name={key} required={required.has(key)} disabled={busy}
      type={key === 'date_of_birth' ? 'date' : key === 'google_scholar_url' ? 'url' : 'text'}
      inputMode={key.endsWith('phone') || key === 'staff_mobile' ? 'tel' : key === 'passing_year' ? 'numeric' : undefined}
      value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />
  </label>;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
    <form onSubmit={event => void submit(event)} className="mx-auto max-w-4xl space-y-6 rounded-2xl border bg-white p-5 sm:p-8">
      <header>
        <p className="text-sm font-semibold text-amber-800">Pharmacy profile and document recovery</p>
        <h1 className="mt-2 text-2xl font-bold">Review your saved details and submit to HR</h1>
        {identityLabel && <p className="mt-2 break-words text-sm font-medium">{identityLabel}</p>}
        <p className="mt-3 text-sm text-slate-700">Your existing information is prefilled and will not be deleted. Some earlier document files are unavailable. Upload only the replacements requested below and complete the important missing details. Portal access resumes after HR approval.</p>
        {review.return_reason && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">{review.return_reason}</p>}
      </header>
      <section aria-label="Important profile details" className="space-y-3">
        <h2 className="font-semibold">Important details</h2>
        <div className="grid gap-4 sm:grid-cols-2">{Object.keys(FIELDS).filter(key => required.has(key)).map(field)}</div>
      </section>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">Other saved information — optional</summary>
        <p className="mt-2 text-sm text-slate-600">These fields are not required unless HR specifically requests a correction. Existing values are retained.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{Object.keys(FIELDS).filter(key => !required.has(key)).map(field)}</div>
      </details>
      <section aria-label="Required documents" className="space-y-3">
        <h2 className="font-semibold">Documents</h2>
        <p className="text-sm text-slate-600">PDF, JPG, PNG or WebP; maximum 10 MB per file. Previous document records and review history remain retained.</p>
        {Object.entries(DOCS).map(([type, label]) => <div key={type} className="rounded-lg border p-4">
          <label className="block text-sm font-medium">{label}
            <span className="ml-2 text-xs text-slate-600">{received.has(type) ? 'Replacement received' : neededDocs.includes(type) ? 'Replacement required' : 'Existing file retained'}</span>
            {neededDocs.includes(type) && <Input className="mt-2" type="file" aria-label={`Upload ${label}`}
              disabled={busy} accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={event => {
                const file = event.target.files?.[0]; if (file) void upload(type, file);
              }} />}
          </label>
        </div>)}
      </section>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="text-sm text-green-800">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Submit profile and documents to HR'}</Button>
        <Button type="button" variant="ghost" onClick={onSignOut} disabled={busy}>Sign out</Button>
      </div>
    </form>
  </main>;
}
