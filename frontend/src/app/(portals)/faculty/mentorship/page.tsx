'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { MentorshipChatMessenger } from '@/components/mentorship/MentorshipChatMessenger';
import { EcellMentorInbox } from '@/components/ecell/EcellMentorInbox';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoMentees, facultyDemoPendingApprovals } from '@/lib/mock/faculty-portal-demo';

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
  const { user } = useAuth();
  return <MentorshipWorkspace key={`${user?.tenant_id ?? ''}:${user?.user_id ?? ''}`} />;
}

function MentorshipWorkspace() {
  const api = useAuthedApi();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [pendingCertificates, setPendingCertificates] = useState<PendingCertificate[]>([]);
  const [pendingMeetings, setPendingMeetings] = useState<PendingMeeting[]>([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<PendingLeaveRequest[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [certificateBusy, setCertificateBusy] = useState<string | null>(null);
  const activeApi = useRef(api);
  useLayoutEffect(() => { activeApi.current = api; }, [api]);
  const alive = useRef(true);
  const studentsRequest = useRef(0);
  const approvalsRequest = useRef(0);
  const decisionLock = useRef<string | null>(null);
  const current = useCallback(() => alive.current && activeApi.current === api, [api]);

  const loadStudents = useCallback(async () => {
    const request = ++studentsRequest.current;
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const rows = await api.get<StudentInfo[]>('/api/academics/proctor/my-students');
      if (!current() || request !== studentsRequest.current) return;
      setStudents(withFacultyDemoFallback(rows, facultyDemoMentees(), isEmptyArray));
    } catch (error) {
      if (!current() || request !== studentsRequest.current) return;
      const fallback = withFacultyDemoFallback([], facultyDemoMentees(), isEmptyArray);
      if (fallback.length) setStudents(fallback);
      else setStudentsError(error instanceof Error ? error.message : 'Could not load mentees');
    } finally {
      if (current() && request === studentsRequest.current) setStudentsLoading(false);
    }
  }, [api, current]);

  const loadApprovals = useCallback(async () => {
    const request = ++approvalsRequest.current;
    setApprovalsLoading(true);
    setApprovalsError(null);
    const apply = (data: PendingApprovals) => {
      setPendingCertificates(data.certificates ?? []);
      setPendingMeetings(data.meetings ?? []);
      setPendingLeaveRequests(data.leave_requests ?? []);
    };
    try {
      const rows = await api.get<PendingApprovals>('/api/academics/proctor/pending-approvals');
      if (!current() || request !== approvalsRequest.current) return;
      apply(withFacultyDemoFallback(rows, facultyDemoPendingApprovals(), (value) => !value ||
        !(value.certificates?.length || value.meetings?.length || value.leave_requests?.length)));
    } catch (error) {
      if (!current() || request !== approvalsRequest.current) return;
      const fallback = withFacultyDemoFallback<PendingApprovals>(
        { certificates: [], meetings: [], leave_requests: [] }, facultyDemoPendingApprovals(), () => true,
      );
      if (fallback.certificates.length || fallback.meetings?.length || fallback.leave_requests?.length) apply(fallback);
      else setApprovalsError(error instanceof Error ? error.message : 'Could not load mentorship approvals');
    } finally {
      if (current() && request === approvalsRequest.current) setApprovalsLoading(false);
    }
  }, [api, current]);

  const loadWorkspace = useCallback(async () => {
    await Promise.all([loadStudents(), loadApprovals()]);
  }, [loadStudents, loadApprovals]);

  useEffect(() => {
    alive.current = true;
    // Refreshing the authenticated API must invalidate the prior roster and pending decision state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudents([]);
    setPendingCertificates([]);
    setPendingMeetings([]);
    setPendingLeaveRequests([]);
    setCertificateBusy(null);
    decisionLock.current = null;
    void loadWorkspace();
    return () => {
      alive.current = false;
      studentsRequest.current += 1;
      approvalsRequest.current += 1;
    };
  }, [loadWorkspace]);

  async function openCertificate(certificateId: string) {
    try {
      const blob = await api.getBlob(`/api/academics/certificates/${certificateId}/download`);
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (current()) toast.error(error instanceof Error ? error.message : 'Unable to open certificate');
    }
  }

  async function verifyCertificate(certificateId: string, status: 'VERIFIED' | 'REJECTED') {
    if (decisionLock.current || approvalsLoading || approvalsError) return;
    const reason = status === 'REJECTED' ? window.prompt('Reason for rejection?') : undefined;
    if (reason === null) return;
    const rejection_reason = reason?.trim();
    if (status === 'REJECTED' && !rejection_reason) {
      toast.error('Enter a reason for rejection');
      return;
    }

    decisionLock.current = certificateId;
    setCertificateBusy(certificateId);
    try {
      if (isFacultyDemoSmokeId(certificateId)) {
        setPendingCertificates((prev) => prev.filter((item) => item.certificate_id !== certificateId));
        toast.success(status === 'VERIFIED' ? 'Certificate approved (demo)' : 'Certificate rejected (demo)');
        return;
      }
      await api.post('/api/academics/proctor/approve-certificate', {
        certificate_id: certificateId,
        status,
        rejection_reason,
      });
      if (!current()) return;
      approvalsRequest.current += 1;
      setPendingCertificates((prev) => prev.filter((item) => item.certificate_id !== certificateId));
      toast.success(status === 'VERIFIED' ? 'Certificate approved' : 'Certificate rejected');
    } catch (error) {
      if (current()) toast.error(error instanceof Error ? error.message : 'Unable to update certificate');
    } finally {
      if (current()) { decisionLock.current = null; setCertificateBusy(null); }
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Mentorship"
        description="View and manage mentees assigned to you for mentorship."
        meta={
          <>
            <FacultyMetricChip label="Mentees" value={studentsLoading ? '…' : studentsError ? '—' : students.length} />
            <FacultyMetricChip
              label="Pending certs"
              value={approvalsLoading ? '…' : approvalsError ? '—' : pendingCertificates.length}
              emphasis={pendingCertificates.length > 0}
            />
          </>
        }
      />

      {studentsLoading && <FalconLoader label="Loading mentorship roster…" />}
      {approvalsLoading && <FalconLoader label="Loading mentorship approvals…" />}
      {studentsError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{studentsError} <Button variant="outline" size="sm" disabled={studentsLoading} onClick={() => void loadStudents()}>Retry mentees</Button></div>}
      {approvalsError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{approvalsError} <Button variant="outline" size="sm" disabled={approvalsLoading || Boolean(certificateBusy)} onClick={() => void loadApprovals()}>Retry approvals</Button></div>}

      {!studentsLoading && !studentsError && <MentorshipChatMessenger />}

      {!approvalsLoading && !approvalsError && (
        <PendingMeetingRequests meetings={pendingMeetings} onUpdated={loadWorkspace} />
      )}

      {!studentsLoading && !studentsError && <EcellMentorInbox />}

      {!approvalsLoading && !approvalsError && (
        <PendingLeaveRequests requests={pendingLeaveRequests} onUpdated={loadWorkspace} />
      )}

      {!approvalsLoading && !approvalsError && (
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
                  <Button variant="outline" size="sm" disabled={Boolean(certificateBusy)} onClick={() => openCertificate(certificate.certificate_id)}>
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <Button size="sm" disabled={Boolean(certificateBusy)} onClick={() => verifyCertificate(certificate.certificate_id, 'VERIFIED')}>
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={Boolean(certificateBusy)}
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

      {!studentsLoading && !studentsError && students.length === 0 && (
        <FacultyEmptyState title="No mentees yet" description="No mentees have been assigned to you." />
      )}

      {!studentsLoading && students.length > 0 && (
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
                      {(item.student?.name ?? 'ST')
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'ST'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold text-sgvu-navy">{item.student?.name ?? 'Mentee'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.student?.email ?? '—'}
                    </p>
                  </div>
                </div>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  size="sm"
                  disabled={!item.student?.email}
                  onClick={() => {
                    if (item.student?.email) window.open(`mailto:${item.student.email}`);
                  }}
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
