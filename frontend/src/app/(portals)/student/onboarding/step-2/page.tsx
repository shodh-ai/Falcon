'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OnboardingDocDropzone } from '@/components/student/OnboardingDocDropzone';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';

type DocType = 'PHOTO' | 'AADHAAR' | '10TH_MARKSHEET' | '12TH_MARKSHEET';

type OnboardingDoc = {
  doc_type: DocType;
  file_path: string;
  status: string;
};

const DOC_LABELS: Record<DocType, string> = {
  PHOTO: 'Passport Size Photo',
  AADHAAR: 'Aadhaar Card',
  '10TH_MARKSHEET': '10th Marksheet',
  '12TH_MARKSHEET': '12th Marksheet',
};

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

export default function OnboardingStep2Page() {
  const api = useAuthedApi();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [bloodGroup, setBloodGroup] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [abcId, setAbcId] = useState('');
  const [documents, setDocuments] = useState<OnboardingDoc[]>([]);
  const [adminRemarks, setAdminRemarks] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{
        blood_group: string;
        abc_id: string;
        parent_contact_phone: string;
        documents: OnboardingDoc[];
        admin_remarks: string | null;
      }>('/api/student/onboarding/profile');
      setBloodGroup(data.blood_group ?? '');
      setAbcId(data.abc_id ?? '');
      setParentPhone(data.parent_contact_phone ?? '');
      setDocuments(data.documents ?? []);
      setAdminRemarks(data.admin_remarks ?? null);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const uploadDoc = async (docType: DocType, file: File) => {
    setUploading(docType);
    try {
      const form = new FormData();
      form.append('file', file);
      const updated = await api.post<OnboardingDoc[]>(
        `/api/student/onboarding/documents/${docType}`,
        form,
      );
      setDocuments(updated);
      toast.success(`${DOC_LABELS[docType]} uploaded`);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setUploading(null);
    }
  };

  const saveAndSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/api/student/onboarding/profile', {
        blood_group: bloodGroup,
        parent_contact_phone: parentPhone,
        abc_id: abcId,
      });
      await api.post('/api/student/onboarding/submit');
      await refreshUser();
      toast.success('Submitted for admin verification');
      router.replace('/student/onboarding/step-3');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground">Loading profile…</p>;
  }

  return (
    <div className="space-y-6">
      {adminRemarks && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Admin feedback: {adminRemarks}. Please re-upload clearer documents and resubmit.
        </div>
      )}

      <Card className="border-sgvu-navy/10 shadow-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-sgvu-navy/10">
            <FileCheck2 className="h-5 w-5 text-sgvu-navy" />
          </div>
          <CardTitle className="text-sgvu-navy">Step 2 · Profile & Document Vault</CardTitle>
          <CardDescription>
            Complete your vital information and upload all mandatory documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="blood" className="text-sm font-medium">Blood Group</label>
              <Input id="blood" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="e.g. O+" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="parent" className="text-sm font-medium">Parent Contact Number</label>
              <Input id="parent" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="+91…" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="abc" className="text-sm font-medium">ABC ID</label>
              <Input id="abc" value={abcId} onChange={(e) => setAbcId(e.target.value)} placeholder="12-digit ABC ID" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(DOC_LABELS) as DocType[]).map((docType) => {
              const existing = documents.find((d) => d.doc_type === docType);
              return (
                <OnboardingDocDropzone
                  key={docType}
                  label={DOC_LABELS[docType]}
                  hint={docType === 'PHOTO' ? 'JPG or PNG · Max 5MB' : 'PDF or image · Max 5MB'}
                  accept={docType === 'PHOTO' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : undefined}
                  disabled={uploading !== null}
                  fileName={existing?.file_path ? DOC_LABELS[docType] : null}
                  onFile={(file) => void uploadDoc(docType, file)}
                />
              );
            })}
          </div>

          <Button
            type="button"
            className="w-full bg-sgvu-navy hover:bg-sgvu-navy/90"
            disabled={submitting || uploading !== null}
            onClick={() => void saveAndSubmit()}
          >
            <Send className="mr-2 h-4 w-4" />
            {submitting ? 'Submitting…' : 'Submit for Verification'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
