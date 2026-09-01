'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getSubdomainFromClient } from '@/lib/tenant';

type QueueRow = {
  user_id: string;
  name: string;
  official_email: string;
  onboarding_status: string;
  role_name: string;
  portal_kind: string;
  submitted_at: string | null;
  doc_count: string;
};

type VerificationDetail = {
  portal_kind: string;
  person: {
    user_id: string;
    name: string;
    email: string;
    role_name: string;
    blood_group?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    staff_mobile?: string | null;
    abc_id?: string | null;
    pan_number?: string | null;
    aadhaar_number?: string | null;
    bank_account_no?: string | null;
    ifsc_code?: string | null;
    pf_uan?: string | null;
    parent_contact_phone?: string | null;
    emergency_contact_phone?: string | null;
    orcid_id?: string | null;
    scopus_id?: string | null;
    google_scholar_url?: string | null;
    total_experience_years?: string | null;
    industry_experience_years?: string | null;
    degree_level?: string | null;
    degree_name?: string | null;
    university?: string | null;
    passing_year?: string | null;
    specialization?: string | null;
    onboarding_status?: string;
    employee_id?: string | null;
    designation?: string | null;
    enrollment_no?: string | null;
    batch?: string | null;
  };
  documents: Array<{
    doc_id: string;
    doc_type: string;
    file_path: string;
    status: string;
  }>;
};

const DOC_LABELS: Record<string, string> = {
  PHOTO: 'Passport Photo',
  AADHAAR: 'Aadhaar Card',
  PAN: 'PAN Card',
  HIGHEST_DEGREE: 'Highest Degree',
  '10TH_MARKSHEET': '10th Marksheet',
  '12TH_MARKSHEET': '12th Marksheet',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function buildPreviewUrl(studentUserId: string, docType: string) {
  return `${API_URL}/api/admin/student-verifications/${studentUserId}/documents/${docType}/preview`;
}

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

export default function AdminStudentVerificationsPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<QueueRow[]>('/api/admin/student-verifications/queue');
      setQueue(rows);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!selectedId || !previewDoc || !token) {
      setPreviewUrl(null);
      return;
    }
    const doc = detail?.documents.find((d) => d.file_path === previewDoc);
    if (!doc) return;

    let revoked: string | null = null;
    const loadPreview = async () => {
      try {
        if (previewDoc.startsWith('http')) {
          setPreviewUrl(previewDoc);
          return;
        }
        const response = await fetch(buildPreviewUrl(selectedId, doc.doc_type), {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        });
        if (!response.ok) throw new Error('Preview failed');
        const blob = await response.blob();
        revoked = URL.createObjectURL(blob);
        setPreviewUrl(revoked);
      } catch {
        setPreviewUrl(null);
      }
    };
    void loadPreview();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [detail?.documents, previewDoc, selectedId, token]);

  const openReview = async (userId: string) => {
    setSelectedId(userId);
    setRejectReason('');
    setPreviewDoc(null);
    try {
      const data = await api.get<VerificationDetail>(`/api/admin/student-verifications/${userId}`);
      setDetail(data);
      if (data.documents[0]) setPreviewDoc(data.documents[0].file_path);
      if (data.person.onboarding_status !== 'PENDING_ADMIN_APPROVAL') {
        toast.error(
          data.person.onboarding_status === 'COMPLETED'
            ? 'This user has already been approved. Refresh the queue.'
            : `This user is no longer awaiting review (${data.person.onboarding_status}).`,
        );
      }
    } catch (err) {
      toast.error(parseApiError(err));
      setSelectedId(null);
    }
  };

  const canReview = detail?.person.onboarding_status === 'PENDING_ADMIN_APPROVAL';

  const approve = async () => {
    if (!selectedId) return;
    setActing(true);
    try {
      await api.post(`/api/admin/student-verifications/${selectedId}/approve`);
      toast.success('Approved — portal unlocked');
      setSelectedId(null);
      setDetail(null);
      await loadQueue();
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!selectedId || !rejectReason.trim()) {
      toast.error('Enter a rejection reason');
      return;
    }
    setActing(true);
    try {
      await api.post(`/api/admin/student-verifications/${selectedId}/reject`, {
        remarks: rejectReason.trim(),
      });
      toast.success('Sent back for corrections');
      setSelectedId(null);
      setDetail(null);
      await loadQueue();
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <h2 className="text-xl font-bold text-sgvu-navy">First-Login Onboarding Verifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review students, faculty, and HOD submissions awaiting approval.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Verification Queue</CardTitle>
          <CardDescription>{queue.length} user(s) pending admin approval</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading queue…</p>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No users awaiting verification. Students and staff appear here after they finish
              first-login document submission.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Docs</th>
                    <th className="py-2 pr-4 font-medium">Submitted</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((row) => (
                    <tr key={row.user_id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{row.name}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{row.role_name}</Badge>
                      </td>
                      <td className="py-3 pr-4">{row.official_email}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{row.doc_count} files</Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="outline" onClick={() => void openReview(row.user_id)}>
                          <Eye className="mr-1 h-4 w-4" />
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedId && detail)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{detail?.person.name}</DialogTitle>
            <DialogDescription>
              {detail?.person.email} · {detail?.person.role_name}
              {detail?.person.onboarding_status ? ` · ${detail.person.onboarding_status}` : null}
            </DialogDescription>
          </DialogHeader>

          {detail && !canReview ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {detail.person.onboarding_status === 'COMPLETED'
                ? 'This submission has already been approved. Close the dialog and refresh the queue.'
                : 'This user is not awaiting admin approval anymore. Refresh the queue before taking action.'}
            </div>
          ) : null}

          {detail && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-semibold text-sgvu-navy">Submitted Data</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Blood Group</dt>
                  <dd>{detail.person.blood_group ?? '—'}</dd>
                  {detail.portal_kind === 'staff' ? (
                    <>
                      <dt className="text-muted-foreground">Gender / DOB</dt>
                      <dd>
                        {detail.person.gender ?? '—'}
                        {detail.person.date_of_birth ? ` · ${detail.person.date_of_birth}` : ''}
                      </dd>
                      <dt className="text-muted-foreground">Mobile</dt>
                      <dd>{detail.person.staff_mobile ?? '—'}</dd>
                      <dt className="text-muted-foreground">PAN</dt>
                      <dd className="font-mono text-xs">{detail.person.pan_number ?? '—'}</dd>
                      <dt className="text-muted-foreground">Aadhaar</dt>
                      <dd className="font-mono text-xs">{detail.person.aadhaar_number ?? '—'}</dd>
                      <dt className="text-muted-foreground">Bank / IFSC</dt>
                      <dd className="font-mono text-xs">
                        {detail.person.bank_account_no ? `****${detail.person.bank_account_no.slice(-4)}` : '—'}
                        {detail.person.ifsc_code ? ` · ${detail.person.ifsc_code}` : ''}
                      </dd>
                      <dt className="text-muted-foreground">UAN (PF)</dt>
                      <dd>{detail.person.pf_uan || '—'}</dd>
                      <dt className="text-muted-foreground">ORCID</dt>
                      <dd>{detail.person.orcid_id ?? '—'}</dd>
                      <dt className="text-muted-foreground">Experience</dt>
                      <dd>
                        {detail.person.total_experience_years ?? '—'} yrs teaching
                        {detail.person.industry_experience_years
                          ? ` · ${detail.person.industry_experience_years} yrs industry`
                          : ''}
                      </dd>
                      <dt className="text-muted-foreground">Highest degree</dt>
                      <dd>
                        {[detail.person.degree_level, detail.person.degree_name].filter(Boolean).join(' · ') || '—'}
                        {detail.person.university ? ` — ${detail.person.university}` : ''}
                        {detail.person.passing_year ? ` (${detail.person.passing_year})` : ''}
                      </dd>
                      <dt className="text-muted-foreground">Employee ID</dt>
                      <dd>{detail.person.employee_id ?? '—'}</dd>
                      <dt className="text-muted-foreground">Designation</dt>
                      <dd>{detail.person.designation ?? '—'}</dd>
                      <dt className="text-muted-foreground">Emergency Phone</dt>
                      <dd>{detail.person.emergency_contact_phone ?? '—'}</dd>
                      {!detail.person.aadhaar_number && !detail.person.orcid_id && !detail.person.university ? (
                        <dd className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                          KYC, research, and qualification text fields were not submitted — only document uploads
                          and basic contact info are on file. Reject with a note so the user completes all Step 2
                          sections (not just file uploads).
                        </dd>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <dt className="text-muted-foreground">ABC ID</dt>
                      <dd>{detail.person.abc_id ?? '—'}</dd>
                      <dt className="text-muted-foreground">Parent Contact</dt>
                      <dd>{detail.person.parent_contact_phone ?? '—'}</dd>
                      <dt className="text-muted-foreground">Enrollment</dt>
                      <dd>{detail.person.enrollment_no ?? '—'}</dd>
                      <dt className="text-muted-foreground">Batch</dt>
                      <dd>{detail.person.batch ?? '—'}</dd>
                    </>
                  )}
                </dl>
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Documents</p>
                  {detail.documents.map((doc) => (
                    <Button
                      key={doc.doc_id}
                      variant={previewDoc === doc.file_path ? 'default' : 'outline'}
                      size="sm"
                      className="mr-2"
                      onClick={() => setPreviewDoc(doc.file_path)}
                    >
                      {DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-2">
                <p className="mb-2 px-2 text-xs font-medium uppercase text-muted-foreground">Document Preview</p>
                {previewUrl ? (
                  previewUrl.includes('image') || previewDoc?.match(/\.(jpg|jpeg|png)$/i) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Document preview" className="max-h-[420px] w-full rounded-lg object-contain" />
                  ) : (
                    <iframe title="Document preview" src={previewUrl} className="h-[420px] w-full rounded-lg border bg-white" />
                  )
                ) : previewDoc ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading preview…</p>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">Select a document to preview.</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Input
              placeholder='Rejection reason (e.g. "Aadhaar is blurry")'
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setSelectedId(null)} disabled={acting}>
              Close
            </Button>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => void reject()} disabled={acting || !canReview}>
                <XCircle className="mr-1 h-4 w-4" />
                Reject
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => void approve()}
                disabled={acting || !canReview}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Approve
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
