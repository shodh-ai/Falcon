'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { toast } from 'sonner';
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
  submitted_at: string | null;
  doc_count: string;
};

type VerificationDetail = {
  student: {
    user_id: string;
    name: string;
    email: string;
    blood_group: string | null;
    abc_id: string | null;
    parent_contact_phone: string | null;
    enrollment_no: string | null;
    batch: string | null;
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
    } catch (err) {
      toast.error(parseApiError(err));
      setSelectedId(null);
    }
  };

  const approve = async () => {
    if (!selectedId) return;
    setActing(true);
    try {
      await api.post(`/api/admin/student-verifications/${selectedId}/approve`);
      toast.success('Student approved — portal unlocked');
      setSelectedId(null);
      setDetail(null);
      await loadQueue();
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
      toast.success('Sent back to student for corrections');
      setSelectedId(null);
      setDetail(null);
      await loadQueue();
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-sgvu-navy">Student Onboarding Verifications</h2>
        <p className="text-sm text-muted-foreground">
          High-speed queue for pilot students awaiting document approval.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Verification Queue</CardTitle>
          <CardDescription>{queue.length} student(s) pending admin approval</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading queue…</p>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students awaiting verification.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Student</th>
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
            <DialogTitle>{detail?.student.name}</DialogTitle>
            <DialogDescription>{detail?.student.email}</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-semibold text-sgvu-navy">Student Data</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Blood Group</dt>
                  <dd>{detail.student.blood_group ?? '—'}</dd>
                  <dt className="text-muted-foreground">ABC ID</dt>
                  <dd>{detail.student.abc_id ?? '—'}</dd>
                  <dt className="text-muted-foreground">Parent Contact</dt>
                  <dd>{detail.student.parent_contact_phone ?? '—'}</dd>
                  <dt className="text-muted-foreground">Enrollment</dt>
                  <dd>{detail.student.enrollment_no ?? '—'}</dd>
                  <dt className="text-muted-foreground">Batch</dt>
                  <dd>{detail.student.batch ?? '—'}</dd>
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
              <Button variant="destructive" onClick={() => void reject()} disabled={acting}>
                <XCircle className="mr-1 h-4 w-4" />
                Reject
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void approve()} disabled={acting}>
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
