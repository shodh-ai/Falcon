'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Award, Eye, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getSubdomainFromClient } from '@/lib/tenant';

type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

type StudentCertificate = {
  certificate_id: string;
  title: string;
  issuer: string;
  issue_date: string | null;
  original_filename: string | null;
  mime_type: string | null;
  verification_status: VerificationStatus;
  points_awarded: number;
  rejection_reason: string | null;
  uploaded_at: string;
};

const statusMeta: Record<VerificationStatus, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  PENDING: { label: 'Pending Verification', variant: 'warning' },
  VERIFIED: { label: 'Verified by Proctor/IQAC', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
};

export default function StudentCertificatesPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [certificates, setCertificates] = useState<StudentCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    issuer: '',
    issue_date: '',
    file: null as File | null,
  });

  async function loadCertificates() {
    setLoading(true);
    try {
      const data = await api.get<StudentCertificate[]>('/api/academics/certificates/my-certificates');
      setCertificates(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCertificates();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function uploadCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.file) {
      toast.error('Please select a certificate PDF or image');
      return;
    }

    const body = new FormData();
    body.append('title', form.title);
    body.append('issuer', form.issuer);
    if (form.issue_date) body.append('issue_date', form.issue_date);
    body.append('file', form.file);

    setSubmitting(true);
    try {
      await api.post<StudentCertificate>('/api/academics/certificates/upload', body);
      toast.success('Certificate uploaded for verification');
      setUploadOpen(false);
      setForm({ title: '', issuer: '', issue_date: '', file: null });
      await loadCertificates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function previewCertificate(certificateId: string) {
    if (!token) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/academics/certificates/${certificateId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
      });
      if (!response.ok) throw new Error('Unable to open certificate');

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const blob = await response.blob();
      setPreviewMime(blob.type);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open certificate');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sgvu-gold">IQAC-ready portfolio</p>
          <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">
            Achievements & Certifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload workshops, online courses, sports achievements, and other extracurricular proof.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" />
          Upload Certificate
        </Button>
      </section>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin" />
          </CardContent>
        </Card>
      )}

      {!loading && certificates.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Award className="mx-auto h-10 w-10 text-sgvu-gold" />
            <p className="mt-3 font-semibold">No certificates uploaded yet</p>
            <p className="text-sm text-muted-foreground">
              Start building your verified achievement vault.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && certificates.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {certificates.map((certificate) => {
            const meta = statusMeta[certificate.verification_status];
            return (
              <Card key={certificate.certificate_id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg">{certificate.title}</CardTitle>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{certificate.issuer}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <p>Issued: {certificate.issue_date ?? 'Not specified'}</p>
                    <p>Points: {certificate.points_awarded}</p>
                    {certificate.rejection_reason && (
                      <p className="text-destructive">Reason: {certificate.rejection_reason}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => previewCertificate(certificate.certificate_id)}
                  >
                    <Eye className="h-4 w-4" />
                    View Certificate
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Certificate</DialogTitle>
            <DialogDescription>
              Upload a PDF or image. Your proctor will verify it before it is counted.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={uploadCertificate}>
            <Input
              required
              placeholder="Title, e.g. Python for Data Science"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <Input
              required
              placeholder="Issuer, e.g. Coursera, AWS, NPTEL"
              value={form.issuer}
              onChange={(event) => setForm((prev) => ({ ...prev, issuer: event.target.value }))}
            />
            <Input
              type="date"
              value={form.issue_date}
              onChange={(event) => setForm((prev) => ({ ...prev, issue_date: event.target.value }))}
            />
            <Input
              required
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))
              }
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for Verification'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Certificate Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && previewMime?.startsWith('image/') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Certificate preview" className="max-h-[75vh] rounded-lg object-contain" />
          )}
          {previewUrl && !previewMime?.startsWith('image/') && (
            <iframe src={previewUrl} className="h-[75vh] w-full rounded-lg border" title="Certificate preview" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
