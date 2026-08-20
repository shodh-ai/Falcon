'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getSubdomainFromClient } from '@/lib/tenant';
import { toast } from '@/lib/notifications/falcon-toast';

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
    parent_contact_phone?: string | null;
    emergency_contact_phone?: string | null;
    orcid_id?: string | null;
    total_experience_years?: string | null;
    industry_experience_years?: string | null;
    degree_level?: string | null;
    degree_name?: string | null;
    university?: string | null;
    passing_year?: string | null;
    employee_id?: string | null;
    designation?: string | null;
    enrollment_no?: string | null;
    batch?: string | null;
    onboarding_status?: string;
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

function buildPreviewUrl(userId: string, docType: string) {
  return `${API_URL}/api/admin/student-verifications/${userId}/documents/${docType}/preview`;
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

export function CampusAdminVerificationsPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<QueueRow[]>('/api/admin/student-verifications/queue');
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(parseApiError(err) || 'Unable to load verifications.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        term &&
        !`${row.name} ${row.official_email} ${row.role_name}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (kind && row.portal_kind !== kind) return false;
      return true;
    });
  }, [kind, q, rows]);

  const openReview = async (userId: string) => {
    setSelectedId(userId);
    setRejectReason('');
    setPreviewDoc(null);
    setPreviewUrl(null);
    setDetailLoading(true);
    try {
      const data = await api.get<VerificationDetail>(`/api/admin/student-verifications/${userId}`);
      setDetail(data);
      if (data.documents[0]) setPreviewDoc(data.documents[0].file_path);
    } catch (err) {
      toast.error(parseApiError(err));
      setSelectedId(null);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId || !previewDoc || !token) {
      setPreviewUrl(null);
      return;
    }
    const doc = detail?.documents.find((item) => item.file_path === previewDoc);
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

  const canReview = detail?.person.onboarding_status === 'PENDING_ADMIN_APPROVAL';

  const approve = async () => {
    if (!selectedId) return;
    setActing(true);
    try {
      await api.post(`/api/admin/student-verifications/${selectedId}/approve`);
      toast.success('Approved — portal unlocked');
      setSelectedId(null);
      setDetail(null);
      await load();
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
      await load();
      window.dispatchEvent(new Event('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Verifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            First-login submissions from students and staff on your assigned campus.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending</p>
          <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : rows.length}</p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name, email, or role..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <Select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-40"
                >
                  <option value="">All roles</option>
                  <option value="student">Students</option>
                  <option value="staff">Faculty & staff</option>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Docs</th>
                      <th className="p-3 font-medium">Submitted</th>
                      <th className="p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No users awaiting verification on this campus.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-3 font-semibold text-sgvu-navy">{row.name}</td>
                          <td className="p-3">
                            <Badge variant="secondary">{row.role_name}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">{row.official_email}</td>
                          <td className="p-3">{row.doc_count}</td>
                          <td className="p-3">{formatDateTime(row.submitted_at)}</td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              className="text-sm font-semibold text-sgvu-navy hover:underline"
                              onClick={() => void openReview(row.user_id)}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,44rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          {detailLoading && !detail ? (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading details…
            </p>
          ) : detail ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Verification</p>
                <SheetTitle className="mt-1 text-xl font-bold text-sgvu-navy">{detail.person.name}</SheetTitle>
                <SheetDescription className="mt-1 text-sm text-muted-foreground">
                  {detail.person.email} · {detail.person.role_name}
                </SheetDescription>
                <Badge className="mt-2 w-fit" variant="secondary">
                  {detail.person.onboarding_status?.replace(/_/g, ' ') || 'Pending'}
                </Badge>
              </SheetHeader>

              <div className="space-y-5 px-6 py-5">
                {!canReview ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    This user is no longer awaiting approval. Refresh the queue.
                  </p>
                ) : null}

                <Section title="Identity">
                  <Field label="Name" value={detail.person.name} />
                  <Field label="Email" value={detail.person.email} />
                  <Field label="Role" value={detail.person.role_name} />
                  <Field label="Blood group" value={detail.person.blood_group} />
                  <Field label="Gender" value={detail.person.gender} />
                  <Field label="Date of birth" value={formatDate(detail.person.date_of_birth)} />
                </Section>

                {detail.portal_kind === 'staff' ? (
                  <Section title="Employment">
                    <Field label="Employee ID" value={detail.person.employee_id} />
                    <Field label="Designation" value={detail.person.designation} />
                    <Field label="Mobile" value={detail.person.staff_mobile} />
                    <Field label="Emergency phone" value={detail.person.emergency_contact_phone} />
                    <Field label="ORCID" value={detail.person.orcid_id} />
                    <Field
                      label="Experience"
                      value={
                        detail.person.total_experience_years
                          ? `${detail.person.total_experience_years} yrs teaching`
                          : null
                      }
                    />
                    <Field
                      label="Highest degree"
                      value={
                        [detail.person.degree_level, detail.person.degree_name, detail.person.university]
                          .filter(Boolean)
                          .join(' · ') || null
                      }
                      span
                    />
                  </Section>
                ) : (
                  <Section title="Academics">
                    <Field label="Enrollment" value={detail.person.enrollment_no} />
                    <Field label="Batch" value={detail.person.batch} />
                    <Field label="ABC ID" value={detail.person.abc_id} />
                    <Field label="Parent contact" value={detail.person.parent_contact_phone} />
                  </Section>
                )}

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Documents</h3>
                  {detail.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {detail.documents.map((doc) => (
                        <Button
                          key={doc.doc_id}
                          type="button"
                          size="sm"
                          variant={previewDoc === doc.file_path ? 'default' : 'outline'}
                          onClick={() => setPreviewDoc(doc.file_path)}
                        >
                          {DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 min-h-40 rounded-lg border border-sgvu-navy/10 bg-slate-50/70 p-2">
                    {previewUrl ? (
                      previewUrl.includes('image') || previewDoc?.match(/\.(jpg|jpeg|png)$/i) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="Document preview" className="max-h-72 w-full object-contain" />
                      ) : (
                        <iframe title="Document preview" src={previewUrl} className="h-72 w-full rounded-md bg-white" />
                      )
                    ) : previewDoc ? (
                      <p className="p-4 text-sm text-muted-foreground">Loading preview…</p>
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">Select a document to preview.</p>
                    )}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Decision</h3>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (required to reject)"
                    className="h-10 rounded-xl border-sgvu-navy/15"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      className="h-9"
                      disabled={acting || !canReview}
                      onClick={() => void reject()}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      className="h-9 bg-emerald-600 hover:bg-emerald-700"
                      disabled={acting || !canReview}
                      onClick={() => void approve()}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  span,
}: {
  label: string;
  value?: string | number | null;
  span?: boolean;
}) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className={`rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 ${span ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">{display}</dd>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
