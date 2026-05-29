'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Eye,
  Loader2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';

interface StudentInfo {
  mentorship_id: string;
  student: {
    user_id: string;
    name: string;
    email: string;
  };
}

interface PendingCertificate {
  certificate_id: string;
  title: string;
  issuer: string;
  issue_date: string | null;
  uploaded_at: string;
  student: {
    user_id: string;
    name: string;
    email: string;
  } | null;
}

export default function FacultyMentorshipPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [pendingCertificates, setPendingCertificates] = useState<PendingCertificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<StudentInfo[]>('/api/academics/proctor/my-students'),
      api.get<PendingCertificate[]>('/api/academics/certificates/pending-verification'),
    ])
      .then(([studentsData, certificatesData]) => {
        setStudents(studentsData);
        setPendingCertificates(certificatesData);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message || 'Failed to load mentorship workspace');
        setLoading(false);
      });
  }, [api]);

  async function openCertificate(certificateId: string) {
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
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open certificate');
    }
  }

  async function verifyCertificate(certificateId: string, status: 'VERIFIED' | 'REJECTED') {
    const rejection_reason = status === 'REJECTED'
      ? window.prompt('Reason for rejection?') ?? undefined
      : undefined;

    try {
      await api.patch(`/api/academics/certificates/${certificateId}/verify`, {
        status,
        points_awarded: status === 'VERIFIED' ? 5 : 0,
        rejection_reason,
      });
      setPendingCertificates((prev) => prev.filter((item) => item.certificate_id !== certificateId));
      toast.success(status === 'VERIFIED' ? 'Certificate approved' : 'Certificate rejected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update certificate');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Mentorship - My Students</h2>
        <p className="mt-1 text-sm text-muted-foreground">View and manage students assigned to you for mentorship.</p>
      </section>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {!loading && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Certificates to Verify</CardTitle>
            <Badge variant={pendingCertificates.length ? 'warning' : 'success'}>
              {pendingCertificates.length} pending
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingCertificates.length === 0 && (
              <p className="text-sm text-muted-foreground">No certificates are waiting for your review.</p>
            )}
            {pendingCertificates.map((certificate) => (
              <div
                key={certificate.certificate_id}
                className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-sgvu-navy">{certificate.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {certificate.issuer} · {certificate.student?.name ?? 'Student'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Issued: {certificate.issue_date ?? 'Not specified'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openCertificate(certificate.certificate_id)}>
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <Button size="sm" onClick={() => verifyCertificate(certificate.certificate_id, 'VERIFIED')}>
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => verifyCertificate(certificate.certificate_id, 'REJECTED')}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && students.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No students assigned to you yet.</p>
          </CardContent>
        </Card>
      )}

      {!loading && students.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {students.map((item) => (
            <Card key={item.mentorship_id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Student Profile</span>
                  <Badge variant="secondary">Active</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>{item.student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{item.student.name}</p>
                    <p className="text-xs text-muted-foreground">{item.student.email}</p>
                  </div>
                </div>
                <Button className="w-full" variant="outline" onClick={() => window.open(`mailto:${item.student.email}`)}>
                  Send Email
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
