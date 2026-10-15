'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FalconLoader } from '@/components/brand/FalconLoader';

type Review = {
  status: string;
  source?: string;
  requested_fields?: string[];
  requested_docs?: string[];
  corrected_fields?: string[];
  corrected_docs?: string[];
  return_reason?: string | null;
};

const LABELS: Record<string, string> = {
  blood_group: 'Blood group', staff_mobile: 'Mobile number', pan_number: 'PAN number',
  aadhaar_number: 'Aadhaar number', bank_account_no: 'Bank account number',
  ifsc_code: 'IFSC code', pf_uan: 'PF UAN', gender: 'Gender',
  date_of_birth: 'Date of birth', emergency_contact_name: 'Emergency contact name',
  emergency_contact_phone: 'Emergency contact phone', permanent_address: 'Permanent address',
  current_address: 'Current address', orcid_id: 'ORCID ID', scopus_id: 'Scopus ID',
  google_scholar_url: 'Google Scholar URL', total_experience_years: 'Teaching experience',
  industry_experience_years: 'Industry experience', degree_level: 'Degree level',
  degree_name: 'Degree name', university: 'University', passing_year: 'Passing year',
  specialization: 'Specialization', AADHAAR: 'Aadhaar document', PAN: 'PAN document',
  HIGHEST_DEGREE: 'Highest degree certificate', PHOTO: 'Photograph',
};

export function StaffProfileFreezeGate({ children }: { children: ReactNode }) {
  const api = useAuthedApi();
  const { user, logout } = useAuth();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploaded, setUploaded] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (user?.onboarding_status !== 'COMPLETED') {
      setLoading(false);
      return;
    }
    try {
      const result = await api.get<Review>('/api/staff/profile-review/me');
      setReview(result);
      setError('');
    } catch {
      setError('We could not check your HR verification status. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [api, user?.onboarding_status]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading) return <FalconLoader label="Checking HR verification…" className="min-h-screen" />;
  const frozen = review?.source === 'PHARMACY_RECHECK' &&
    ['PENDING_HR', 'RETURNED_FOR_CORRECTION'].includes(review.status);
  // The server enforces an active freeze on every business API request. If this
  // status request fails before a review was loaded, do not freeze unrelated
  // faculty solely because the review service is temporarily unavailable.
  // Keep an already-confirmed freeze in place across transient refresh errors.
  if (!frozen) return <>{children}</>;

  const correct = async () => {
    const fields = review?.requested_fields ?? [];
    const alreadyCorrected = review?.corrected_fields ?? [];
    const changes = Object.fromEntries(fields.filter((key) => !alreadyCorrected.includes(key) && values[key]?.trim())
      .map((key) => [key, values[key].trim()]));
    if (fields.some((key) => !alreadyCorrected.includes(key) && !changes[key])) {
      setError('Enter every field HR asked you to correct.');
      return;
    }
    if ((review?.requested_docs ?? []).some((key) => !uploaded.includes(key) && !review?.corrected_docs?.includes(key))) {
      setError('Upload every document HR asked you to replace.');
      return;
    }
    setBusy(true);
    try {
      if (Object.keys(changes).length) {
        await api.patch('/api/staff/profile-review/me/corrections', changes);
      }
      await api.post('/api/staff/profile-review/me/resubmit');
      setValues({});
      setUploaded([]);
      await load();
    } catch (cause) {
      await load();
      setError(cause instanceof Error ? cause.message : 'Could not resubmit corrections.');
    } finally { setBusy(false); }
  };

  const upload = async (docType: string, file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/api/staff/profile-review/me/documents/${docType}`, form);
      setUploaded((current) => [...new Set([...current, docType])]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document upload failed.');
    } finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="hr-freeze-title"
        className="w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Account temporarily frozen</p>
        <h1 id="hr-freeze-title" className="mt-2 text-2xl font-bold text-slate-900">HR profile verification</h1>
        <p className="mt-3 text-sm text-slate-700">
          You can sign in, but portal activity is paused while HR checks your staff profile.
          Your existing information and documents have been retained. This is not the onboarding waiting room.
        </p>
        {review?.status === 'RETURNED_FOR_CORRECTION' && (
          <div className="mt-5 space-y-4">
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              HR requested corrections: {review.return_reason}
            </p>
            {(review.requested_fields ?? []).map((field) => (
              <label key={field} className="block text-sm font-medium text-slate-800">
                {LABELS[field] ?? field} {review.corrected_fields?.includes(field) ? '✓ corrected' : ''}
                <Input className="mt-1" value={values[field] ?? ''}
                  disabled={review.corrected_fields?.includes(field)}
                  onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
                  placeholder={`Correct ${LABELS[field] ?? field}`} />
              </label>
            ))}
            {(review.requested_docs ?? []).map((doc) => (
              <label key={doc} className="block text-sm font-medium text-slate-800">
                Replace {LABELS[doc] ?? doc} {uploaded.includes(doc) || review.corrected_docs?.includes(doc) ? '✓' : ''}
                <Input className="mt-1" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={busy || review.corrected_docs?.includes(doc)} onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(doc, file);
                  }} />
              </label>
            ))}
            <Button disabled={busy} onClick={() => void correct()}>Submit corrections to HR</Button>
          </div>
        )}
        {review?.status === 'PENDING_HR' && (
          <p className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
            No action is needed from you yet. HR will either approve the profile or ask for specific corrections.
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Check status</Button>
          <Button variant="ghost" onClick={logout}>Sign out</Button>
        </div>
      </section>
    </main>
  );
}
