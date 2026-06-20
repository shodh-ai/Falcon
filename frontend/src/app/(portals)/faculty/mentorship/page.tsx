'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { PendingMeetingRequests, type PendingMeeting } from '@/components/mentorship/PendingMeetingRequests';
import { PendingLeaveRequests, type PendingLeaveRequest } from '@/components/mentorship/PendingLeaveRequests';
import { FalconLoader } from '@/components/brand/FalconLoader';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyMetricChip,
  FacultyEmptyState,
  FacultyPanel,
} from '@/components/faculty';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';
import { MentorshipChatMessenger } from '@/components/mentorship/MentorshipChatMessenger';
import { EcellMentorInbox } from '@/components/ecell/EcellMentorInbox';

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

interface PendingApprovals {
  certificates: PendingCertificate[];
  meetings?: PendingMeeting[];
  leave_requests?: PendingLeaveRequest[];
}

export default function FacultyMentorshipPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [pendingCertificates, setPendingCertificates] = useState<PendingCertificate[]>([]);
  const [pendingMeetings, setPendingMeetings] = useState<PendingMeeting[]>([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<PendingLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  function loadWorkspace() {
    setLoading(true);
    Promise.all([
      api.get<StudentInfo[]>('/api/academics/proctor/my-students'),
      api.get<PendingApprovals>('/api/academics/proctor/pending-approvals'),
    ])
      .then(([studentsData, approvals]) => {
        setStudents(studentsData);
        setPendingCertificates(approvals.certificates);
        setPendingMeetings(approvals.meetings ?? []);
        setPendingLeaveRequests(approvals.leave_requests ?? []);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message || 'Failed to load mentorship workspace');
        setLoading(false);
      });
  }

  useEffect(() => {
    loadWorkspace();
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
      await api.post('/api/academics/proctor/approve-certificate', {
        certificate_id: certificateId,
        status,
        rejection_reason,
      });
      setPendingCertificates((prev) => prev.filter((item) => item.certificate_id !== certificateId));
      toast.success(status === 'VERIFIED' ? 'Certificate approved' : 'Certificate rejected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update certificate');
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="View and manage mentees assigned to you for mentorship."
        meta={
          <>
            <FacultyMetricChip label="Mentees" value={students.length} />
            <FacultyMetricChip
              label="Pending certs"
              value={pendingCertificates.length}
              emphasis={pendingCertificates.length > 0}
            />
          </>
        }
      />

      {loading && <FalconLoader label="Loading mentorship roster…" />}

      {!loading && <MentorshipChatMessenger />}

      {!loading && (
        <PendingMeetingRequests meetings={pendingMeetings} onUpdated={loadWorkspace} />
      )}

      {!loading && <EcellMentorInbox />}

      {!loading && (
        <PendingLeaveRequests requests={pendingLeaveRequests} onUpdated={loadWorkspace} />
      )}

      {!loading && (
        <FacultyPanel
          title="Pending certificates"
          count={pendingCertificates.length}
          description="Review and verify mentee certificate uploads"
        >
          {pendingCertificates.length === 0 && (
            <FacultyEmptyState description="No certificates are waiting for your review." className="py-6" />
          )}
          <div className="space-y-3">
            {pendingCertificates.map((certificate) => (
              <div
                key={certificate.certificate_id}
                className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-sgvu-navy">{certificate.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {certificate.issuer} · {certificate.student?.name ?? 'Mentee'}
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
          </div>
        </FacultyPanel>
      )}

      {!loading && students.length === 0 && (
        <FacultyEmptyState title="No mentees yet" description="No mentees have been assigned to you." />
      )}

      {!loading && students.length > 0 && (
        <FacultyPanel title="Mentee profiles" count={students.length}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((item) => (
              <div
                key={item.mentorship_id}
                className="rounded-xl border border-border/60 bg-background p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className="bg-sgvu-gold/20 text-sgvu-navy">
                      {item.student.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold text-sgvu-navy">{item.student.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.student.email}</p>
                  </div>
                </div>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`mailto:${item.student.email}`)}
                >
                  Send email
                </Button>
              </div>
            ))}
          </div>
        </FacultyPanel>
      )}
    </FacultyPageShell>
  );
}
