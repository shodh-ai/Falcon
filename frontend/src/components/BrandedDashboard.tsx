'use client';

import { Select } from '@/components/ui/select';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { AppShell, EmptyTaskState } from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle,
  Flag,
  Loader2,
  RefreshCcw,
  Repeat2,
  Search,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Assignment = {
  assignment_id: string;
  status: string;
  due_date?: string;
  task?: {
    task_name?: string;
    task_description?: string;
    month?: string;
    role?: {
      role_name?: string;
    };
  };
  assigned_user?: {
    name?: string;
    email?: string;
  };
  submissions?: {
    submission_id: string;
    file_name?: string;
    file_path?: string;
    ai_status?: 'PENDING' | 'VALIDATED' | 'REJECTED_MISMATCH' | null;
    ai_extracted_data?: Record<string, unknown> | null;
    ai_remarks?: string | null;
  }[];
};

type UserRecord = {
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  role_id?: number;
  role?: {
    role_name?: string;
  };
  department?: {
    dept_name?: string;
  };
};

export default function BrandedDashboard({ hideShell = false }: { hideShell?: boolean } = {}) {
  const { user, token, isAuthenticated } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [handoverHistory, setHandoverHistory] = useState<any[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const currentMonth = 'May';

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const syncSection = () => {
      setSection(new URLSearchParams(window.location.search).get('section'));
    };

    syncSection();
    window.addEventListener('popstate', syncSection);
    window.addEventListener('dashboard-section-change', syncSection);

    return () => {
      window.removeEventListener('popstate', syncSection);
      window.removeEventListener('dashboard-section-change', syncSection);
    };
  }, []);

  useEffect(() => {
    if (token && user) {
      refreshDashboardData();
    }
  }, [token, user?.user_id, user?.role]);

  const refreshDashboardData = async () => {
    if (!token || !user) return;

    const headers = { Authorization: `Bearer ${token}` };
    const role = user.role;

    // These backend routes are role-guarded; avoid 403s for Dean / Faculty / etc.
    const canSeeUserStats = role === 'IQAC' || role === 'HR' || role === 'President';
    const canSeeTaskStats = canSeeUserStats || role === 'Dean';
    const canSeeAllAssignments = role === 'IQAC' || role === 'HR' || role === 'President';

    const adminFetches: Promise<void>[] = [];

    if (canSeeUserStats) {
      adminFetches.push(
        fetch(`${getApiBaseUrl()}/users/stats`, { headers }).then(async (r) => {
          if (r.ok) setStats(await r.json());
          else setStats(null);
        }),
      );
    } else {
      setStats(null);
    }

    if (canSeeTaskStats) {
      adminFetches.push(
        fetch(`${getApiBaseUrl()}/tasks/stats/${currentMonth}`, { headers }).then(async (r) => {
          if (r.ok) setTaskStats(await r.json());
          else setTaskStats(null);
        }),
      );
    } else {
      setTaskStats(null);
    }

    if (canSeeAllAssignments) {
      adminFetches.push(
        fetch(`${getApiBaseUrl()}/tasks/assignments/all`, { headers }).then(async (r) => {
          if (r.ok) setAssignments(await r.json());
          else setAssignments([]);
        }),
      );
    } else {
      setAssignments([]);
    }

    await Promise.all(adminFetches);

    if (user?.role === 'IQAC' || user?.role === 'HR') {
      const [allUsersResponse, handoverHistoryResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/users`, { headers }),
        fetch(`${getApiBaseUrl()}/handover/history`, { headers }),
      ]);
      if (allUsersResponse.ok) setAllUsers(await allUsersResponse.json());
      if (handoverHistoryResponse.ok) setHandoverHistory(await handoverHistoryResponse.json());
    }

    if (user?.role !== 'IQAC' && user?.role !== 'HR' && user?.role !== 'President') {
      const myAssignmentsResponse = await fetch(`${getApiBaseUrl()}/tasks/assignments/my`, { headers });
      if (myAssignmentsResponse.ok) setMyAssignments(await myAssignmentsResponse.json());
      const mySubmissionsResponse = await fetch(`${getApiBaseUrl()}/tasks/submissions/my`, { headers });
      if (mySubmissionsResponse.ok) setMySubmissions(await mySubmissionsResponse.json());
    }
  };

  const forceDistributeTasks = async () => {
    if (!token) return;

    setIsDistributing(true);
    setActionMessage(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/scheduler/distribute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ month: currentMonth }),
      });

      if (!response.ok) {
        throw new Error('Unable to distribute tasks right now.');
      }

      const created = await response.json();
      await refreshDashboardData();
      setActionMessage(`Task distribution for ${currentMonth} completed. Created ${Array.isArray(created) ? created.length : 0} new assignments.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Task distribution failed.');
    } finally {
      setIsDistributing(false);
    }
  };

  if (!user) return null;

  const content = (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="overflow-hidden rounded-[2rem] bg-[#08234a] shadow-xl shadow-[#08234a]/10">
        <div className="relative px-6 py-8 sm:px-8 lg:px-10">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-bl-full bg-[#d6b65d]/20" />
          <div className="absolute bottom-0 right-28 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 inline-flex rounded-full bg-[#d6b65d] px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#08234a]">
                Suresh Gyan Vihar University
              </p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Welcome, {user.name}</h2>
              <p className="mt-3 max-w-2xl text-blue-100">
                Track monthly governance duties, upload compliance records, and monitor task completion from one official portal.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 text-white backdrop-blur">
              <p className="text-sm text-blue-100">Current Role</p>
              <p className="text-2xl font-bold text-[#d6b65d]">{user.role}</p>
            </div>
          </div>
        </div>
      </section>

      {section === 'handover' && (user.role === 'IQAC' || user.role === 'HR') ? (
        <HandoverDashboard users={allUsers} history={handoverHistory} token={token} onRefresh={refreshDashboardData} />
      ) : user.role === 'IQAC' || user.role === 'HR' ? (
        <AdminDashboard
          stats={stats}
          taskStats={taskStats}
          assignments={assignments}
          token={token}
          isDistributing={isDistributing}
          actionMessage={actionMessage}
          onForceDistribute={forceDistributeTasks}
          onRefresh={refreshDashboardData}
        />
      ) : user.role === 'President' ? (
        <PresidentDashboard stats={stats} />
      ) : (
        <MyTasksDashboard
          assignments={myAssignments}
          submissions={mySubmissions}
          token={token}
          section={section}
          onRefresh={refreshDashboardData}
        />
      )}
    </div>
  );

  if (hideShell) {
    return content;
  }

  return <AppShell>{content}</AppShell>;
}

function MetricCard({ title, value, tone, icon: Icon }: { title: string; value: string | number; tone: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-[#08234a]">{value}</p>
    </div>
  );
}

function MyTasksDashboard({
  assignments,
  submissions,
  token,
  section,
  onRefresh,
}: {
  assignments: Assignment[];
  submissions: any[];
  token: string | null;
  section: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pendingAssignments = assignments.filter((assignment) => assignment.status === 'Pending');
  const completedAssignments = assignments.filter((assignment) => assignment.status === 'Completed');
  const overdueAssignments = assignments.filter((assignment) => assignment.status === 'Overdue');

  if (section === 'uploads') {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d6b65d]">Upload History</p>
          <h2 className="mt-2 text-3xl font-bold text-[#08234a]">Your Submitted Evidence</h2>
          <p className="mt-2 text-sm text-slate-500">Previously submitted files and remarks appear here.</p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">Task</th>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">Files</th>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">Remarks</th>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {submissions.length > 0 ? (
                  submissions.map((submission) => (
                    <tr key={submission.submission_id}>
                      <td className="min-w-[260px] px-6 py-4 font-semibold text-[#08234a]">
                        {submission.assignment?.task?.task_name || 'Submitted task'}
                      </td>
                      <td className="min-w-[220px] px-6 py-4 text-slate-600">{submission.file_name || '-'}</td>
                      <td className="min-w-[220px] px-6 py-4 text-slate-600">{submission.text_input || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {submission.uploaded_at ? new Date(submission.uploaded_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500">
                      No upload history yet. Complete a task to see submissions here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const submitAssignment = async () => {
    if (!token || !selectedAssignment) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      let uploadedFiles: any[] = [];

      if (files && files.length > 0) {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append('files', file));

        const uploadResponse = await fetch(`${getApiBaseUrl()}/uploads/multiple`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('File upload failed. Please check file type and size.');
        }

        uploadedFiles = await uploadResponse.json();
      }

      const primaryFile = uploadedFiles[0];
      const submissionResponse = await fetch(`${getApiBaseUrl()}/tasks/submissions/${selectedAssignment.assignment_id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_path: uploadedFiles.map((file) => file.path).join(', '),
          file_name: uploadedFiles.map((file) => file.originalname).join(', '),
          file_size: uploadedFiles.reduce((total, file) => total + file.size, 0) || primaryFile?.size,
          file_type: uploadedFiles.map((file) => file.mimetype).join(', '),
          text_input: textInput,
        }),
      });

      if (!submissionResponse.ok) {
        throw new Error('Submission failed. Please try again.');
      }

      const hasPdf = uploadedFiles.some((f: { mimetype?: string }) =>
        (f.mimetype || '').toLowerCase().includes('pdf'),
      );

      setSelectedAssignment(null);
      setFiles(null);
      setTextInput('');
      setMessage(
        hasPdf
          ? 'Uploaded successfully! AI is analyzing your PDF; the audit badge will update in a few seconds.'
          : 'Task submitted successfully.',
      );
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard title="Pending" value={pendingAssignments.length} tone="bg-blue-50 text-blue-700" icon={CalendarDays} />
        <MetricCard title="Completed" value={completedAssignments.length} tone="bg-emerald-50 text-emerald-700" icon={CheckCircle} />
        <MetricCard title="Overdue" value={overdueAssignments.length} tone="bg-red-50 text-red-700" icon={AlertCircle} />
      </div>

      {message && <p className="rounded-xl bg-[#08234a]/5 px-4 py-3 text-sm text-[#08234a]">{message}</p>}

      {pendingAssignments.length > 0 ? (
        <div className="space-y-4">
          {pendingAssignments.map((assignment) => (
            <button
              key={assignment.assignment_id}
              onClick={() => setSelectedAssignment(assignment)}
              className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-[#d6b65d] hover:shadow-md"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d6b65d]">{assignment.task?.month || 'Current Month'} Task</p>
                  <h3 className="mt-2 text-xl font-bold text-[#08234a]">{assignment.task?.task_name}</h3>
                  <p className="mt-2 text-sm text-slate-500">Due date: {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'Not set'}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">{assignment.status}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyTaskState />
      )}

      {completedAssignments.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-[#08234a]">Completed Tasks</h3>
          <div className="mt-4 space-y-3">
            {completedAssignments.map((assignment) => (
              <div key={assignment.assignment_id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                <span className="font-semibold text-emerald-900">{assignment.task?.task_name}</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Completed</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedAssignment && (
        <div className="rounded-3xl border border-[#d6b65d]/50 bg-white p-6 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d6b65d]">Submit Evidence</p>
              <h3 className="mt-2 text-2xl font-bold text-[#08234a]">{selectedAssignment.task?.task_name}</h3>
            </div>
            <button onClick={() => setSelectedAssignment(null)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">
              Close
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Upload dummy PDF and image</span>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                onChange={(event) => setFiles(event.target.files)}
                className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Remarks</span>
              <textarea
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                rows={4}
                className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm"
                placeholder="Add a short note about the uploaded evidence."
              />
            </label>
            <button
              onClick={submitAssignment}
              disabled={isSubmitting}
              className="rounded-xl bg-[#d6b65d] px-5 py-3 text-sm font-bold text-[#08234a] shadow-md hover:bg-[#c5a64f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Submitting...' : 'Submit and Mark as Complete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HandoverDashboard({
  users,
  history,
  token,
  onRefresh,
}: {
  users: UserRecord[];
  history: any[];
  token: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fromUser = users.find((user) => user.user_id === fromUserId);
  const replacementUsers = users.filter((user) => user.is_active && user.user_id !== fromUserId && (!fromUser || user.role_id === fromUser.role_id));

  const submitHandover = async () => {
    if (!token || !fromUserId || !toUserId) {
      setMessage('Select both outgoing and replacement users.');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/handover`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_user: fromUserId,
          to_user: toUserId,
          notes: notes || undefined,
        }),
      });

      if (response.ok) {
        setMessage('Handover completed. Pending tasks were transferred and the outgoing user was deactivated.');
        setFromUserId('');
        setToUserId('');
        setNotes('');
        await onRefresh();
      } else {
        const error = await response.json().catch(() => null);
        setMessage(error?.message || 'Handover failed.');
      }
    } catch (error) {
      setMessage('Handover failed due to a network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#d6b65d]/20 text-[#8a6a12]">
            <Repeat2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d6b65d]">User Transition</p>
            <h2 className="text-3xl font-bold text-[#08234a]">Task Handover</h2>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">Transfer pending tasks from an outgoing user to an active replacement with the same role.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-[#08234a]">Perform Handover</h3>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Outgoing user</span>
              <Select value={fromUserId} onChange={(event) => { setFromUserId(event.target.value); setToUserId(''); }} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <option value="">Select outgoing user</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.name} — {user.role?.role_name || 'No role'} {user.is_active ? '' : '(Inactive)'}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Replacement user</span>
              <Select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <option value="">Select replacement user</option>
                {replacementUsers.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.name} — {user.role?.role_name || 'No role'} — {user.email}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="Reason for handover or transition details" />
            </label>
            {message && <p className="rounded-xl bg-[#08234a]/5 px-4 py-3 text-sm text-[#08234a]">{message}</p>}
            <button onClick={submitHandover} disabled={isSubmitting} className="w-full rounded-xl bg-[#08234a] px-5 py-3 text-sm font-bold text-white hover:bg-[#0d356f] disabled:opacity-60">
              {isSubmitting ? 'Processing...' : 'Complete Handover'}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="text-xl font-bold text-[#08234a]">Handover History</h3>
            <p className="mt-1 text-sm text-slate-500">Recent handovers performed in the system.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">From</th>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">To</th>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">Performed By</th>
                  <th className="px-6 py-3 text-left font-bold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length > 0 ? history.map((log) => (
                  <tr key={log.handover_id}>
                    <td className="px-6 py-4 font-semibold text-[#08234a]">{log.from_user_entity?.name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{log.to_user_entity?.name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{log.performed_by_entity?.name || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-600">{log.handover_date ? new Date(log.handover_date).toLocaleString() : '-'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500">No handovers recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({
  stats,
  taskStats,
  assignments,
  token,
  isDistributing,
  actionMessage,
  onForceDistribute,
  onRefresh,
}: {
  stats: any;
  taskStats: any;
  assignments: any[];
  token: string | null;
  isDistributing: boolean;
  actionMessage: string | null;
  onForceDistribute: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [aiRetryMessage, setAiRetryMessage] = useState<string | null>(null);
  const [aiRetryError, setAiRetryError] = useState<string | null>(null);
  const [retryingSubmissionId, setRetryingSubmissionId] = useState<string | null>(null);
  const [aiSummaryModal, setAiSummaryModal] = useState<{
    title: string;
    data: Record<string, unknown>;
    remarks?: string | null;
  } | null>(null);

  const submissionAiAggregate = (
    submissions: { ai_status?: string | null }[] | undefined,
  ): 'PENDING' | 'VALIDATED' | 'REJECTED_MISMATCH' | null => {
    const list = submissions || [];
    const statuses = list.map((s) => s.ai_status).filter(Boolean) as string[];
    if (statuses.length === 0) return null;
    if (statuses.includes('PENDING')) return 'PENDING';
    if (statuses.includes('REJECTED_MISMATCH')) return 'REJECTED_MISMATCH';
    if (statuses.includes('VALIDATED')) return 'VALIDATED';
    return null;
  };

  const uniqueRoles = Array.from(new Set(assignments.map((assignment) => assignment.task?.role?.role_name).filter(Boolean))).sort();
  const uniqueStatuses = Array.from(new Set(assignments.map((assignment) => assignment.status).filter(Boolean))).sort();
  const uniqueMonths = Array.from(new Set(assignments.map((assignment) => assignment.task?.month).filter(Boolean))).sort();
  const completedCount = assignments.filter((assignment) => assignment.status === 'Completed').length;
  const pendingCount = assignments.filter((assignment) => assignment.status === 'Pending').length;
  const overdueCount = assignments.filter((assignment) => assignment.status === 'Overdue').length;
  const completionRate = assignments.length > 0 ? Math.round((completedCount / assignments.length) * 100) : 0;
  const departmentCount = new Set(assignments.map((assignment) => assignment.assigned_user?.department?.dept_name).filter(Boolean)).size;
  const submittedFileCount = assignments.reduce((total, assignment) => total + (assignment.submissions?.length || 0), 0);
  const filteredAssignments = assignments.filter((assignment) => {
    const searchText = [
      assignment.assigned_user?.name,
      assignment.assigned_user?.email,
      assignment.assigned_user?.department?.dept_name,
      assignment.task?.role?.role_name,
      assignment.task?.month,
      assignment.task?.task_name,
      assignment.status,
      ...(assignment.submissions || []).map((submission: { file_name?: string }) => submission.file_name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesSearch = searchText.includes(assignmentSearch.trim().toLowerCase());
    const matchesRole = roleFilter === 'all' || assignment.task?.role?.role_name === roleFilter;
    const matchesStatus = statusFilter === 'all' || assignment.status === statusFilter;
    const matchesMonth = monthFilter === 'all' || assignment.task?.month === monthFilter;

    return matchesSearch && matchesRole && matchesStatus && matchesMonth;
  });

  const downloadFile = async (filePath?: string, fileName?: string) => {
    if (!token || !filePath) return;

    const response = await fetch(`${getApiBaseUrl()}/uploads/download?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return;

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'submission-file';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const submissionRowHasPdf = (submission: { file_path?: string; file_type?: string }) => {
    const path = (submission.file_path || '').toLowerCase();
    const type = (submission.file_type || '').toLowerCase();
    if (type.includes('pdf')) return true;
    return path.split(',').some((p) => p.trim().endsWith('.pdf'));
  };

  const retrySubmissionAi = async (submissionId: string) => {
    if (!token) return;
    setRetryingSubmissionId(submissionId);
    setAiRetryMessage(null);
    setAiRetryError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/tasks/submissions/${submissionId}/retry-ai`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const errBody = await res.json().catch(() => ({}));
      const msgRaw = errBody.message;
      const msg = Array.isArray(msgRaw) ? msgRaw[0] : msgRaw;
      if (!res.ok) {
        throw new Error(typeof msg === 'string' ? msg : `Request failed (${res.status})`);
      }
      setAiRetryMessage('AI re-analysis queued. The audit badge will update in a few seconds.');
      await onRefresh();
    } catch (e) {
      setAiRetryError(e instanceof Error ? e.message : 'Could not queue AI retry.');
    } finally {
      setRetryingSubmissionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Total Users" value={stats?.total || 0} tone="bg-[#08234a]/10 text-[#08234a]" icon={Users} />
        <MetricCard title="Active Users" value={stats?.active || 0} tone="bg-emerald-50 text-emerald-700" icon={ShieldCheck} />
        <MetricCard title="Tasks Completed" value={taskStats?.completed || 0} tone="bg-[#d6b65d]/20 text-[#8a6a12]" icon={CheckCircle} />
        <MetricCard title="Pending Tasks" value={taskStats?.pending || 0} tone="bg-red-50 text-red-700" icon={AlertCircle} />
      </div>

      <div className="rounded-3xl border border-[#d6b65d]/40 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d6b65d]">IQAC Admin Override</p>
            <h3 className="mt-2 text-2xl font-bold text-[#08234a]">Force Distribute Tasks for Current Month</h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Use this only for testing or emergency distribution before the scheduled 1st-of-month automation.
            </p>
          </div>
          <button
            onClick={onForceDistribute}
            disabled={isDistributing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d6b65d] px-5 py-3 text-sm font-bold text-[#08234a] shadow-md hover:bg-[#c5a64f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${isDistributing ? 'animate-spin' : ''}`} />
            {isDistributing ? 'Distributing...' : 'Force Distribute Tasks'}
          </button>
        </div>
        {actionMessage && <p className="mt-4 rounded-xl bg-[#08234a]/5 px-4 py-3 text-sm text-[#08234a]">{actionMessage}</p>}
      </div>

      {aiRetryMessage && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{aiRetryMessage}</p>
      )}
      {aiRetryError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">{aiRetryError}</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#08234a]/10 text-[#08234a]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h4 className="font-bold text-[#08234a]">Completion Overview</h4>
          <p className="mt-2 text-3xl font-black text-[#08234a]">{completionRate}%</p>
          <p className="mt-1 text-sm text-slate-500">{completedCount} completed out of {assignments.length} assignments.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#d6b65d]/20 text-[#8a6a12]">
            <Send className="h-5 w-5" />
          </div>
          <h4 className="font-bold text-[#08234a]">Reminder Queue</h4>
          <p className="mt-2 text-3xl font-black text-[#08234a]">{pendingCount}</p>
          <p className="mt-1 text-sm text-slate-500">Pending assignments eligible for reminder emails.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h4 className="font-bold text-[#08234a]">Defaulter Report</h4>
          <p className="mt-2 text-3xl font-black text-[#08234a]">{overdueCount}</p>
          <p className="mt-1 text-sm text-slate-500">{departmentCount} departments tracked, {submittedFileCount} files submitted.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d6b65d]">Global search</p>
            <h3 className="mt-1 text-2xl font-bold text-[#08234a]">Active Task Assignments</h3>
            <p className="mt-1 text-sm text-slate-500">
              Filter by user name, department, task name, month, role, status, or uploaded file name.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={assignmentSearch}
                onChange={(event) => setAssignmentSearch(event.target.value)}
                placeholder="Search by name, department, task, status, month, or file name..."
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none ring-[#d6b65d]/40 focus:border-[#d6b65d] focus:ring-4"
              />
            </div>
            <Select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-[#d6b65d]/40 focus:border-[#d6b65d] focus:ring-4"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map((role) => <option key={role} value={role}>{role}</option>)}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-[#d6b65d]/40 focus:border-[#d6b65d] focus:ring-4"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
            <Select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-[#d6b65d]/40 focus:border-[#d6b65d] focus:ring-4"
            >
              <option value="all">All Months</option>
              {uniqueMonths.map((month) => <option key={month} value={month}>{month}</option>)}
            </Select>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Showing {filteredAssignments.length} of {assignments.length} assignments
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Assigned To</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Role</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Month</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Task</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Status</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">AI audit</th>
                <th className="px-6 py-3 text-left font-bold text-slate-600">Files</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredAssignments.length > 0 ? (
                filteredAssignments.map((assignment) => (
                  <tr key={assignment.assignment_id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <p className="font-semibold text-[#08234a]">{assignment.assigned_user?.name || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{assignment.assigned_user?.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-600">{assignment.task?.role?.role_name || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-600">{assignment.task?.month || '-'}</td>
                    <td className="min-w-[320px] px-6 py-4 text-slate-700">{assignment.task?.task_name || '-'}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                        assignment.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : assignment.status === 'Overdue'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}>
                        {assignment.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {(() => {
                        const agg = submissionAiAggregate(assignment.submissions);
                        if (!agg) return <span className="text-xs text-slate-400">—</span>;
                        if (agg === 'PENDING') {
                          return (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                              Pending
                            </span>
                          );
                        }
                        if (agg === 'VALIDATED') {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                              <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Validated
                            </span>
                          );
                        }
                        const remark =
                          assignment.submissions?.find(
                            (s: { ai_status?: string | null; ai_remarks?: string | null }) =>
                              s.ai_status === 'REJECTED_MISMATCH',
                          )?.ai_remarks || '';
                        return (
                          <span
                            className="inline-flex max-w-[140px] items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800"
                            title={remark}
                          >
                            <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Mismatch
                          </span>
                        );
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {assignment.submissions && assignment.submissions.length > 0 ? (
                        <div className="space-y-2">
                          {assignment.submissions.map(
                            (submission: {
                              submission_id: string;
                              file_name?: string;
                              file_path?: string;
                              ai_status?: string | null;
                              ai_extracted_data?: Record<string, unknown> | null;
                              ai_remarks?: string | null;
                            }) => (
                              <div key={submission.submission_id} className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => downloadFile(submission.file_path, submission.file_name)}
                                  className="block text-left font-semibold text-[#08234a] underline decoration-[#d6b65d] underline-offset-4"
                                >
                                  {submission.file_name || 'Download file'}
                                </button>
                                {submission.ai_status === 'VALIDATED' &&
                                  submission.ai_extracted_data &&
                                  Object.keys(submission.ai_extracted_data).length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAiSummaryModal({
                                          title: submission.file_name || 'AI summary',
                                          data: submission.ai_extracted_data as Record<string, unknown>,
                                          remarks: submission.ai_remarks,
                                        })
                                      }
                                      className="block text-xs font-bold text-[#d6b65d] hover:underline"
                                    >
                                      View AI summary
                                    </button>
                                  )}
                                {submissionRowHasPdf(submission) && (
                                  <button
                                    type="button"
                                    disabled={retryingSubmissionId === submission.submission_id}
                                    onClick={() => retrySubmissionAi(submission.submission_id)}
                                    className="block text-xs font-semibold text-slate-600 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-[#08234a] disabled:opacity-50"
                                  >
                                    {retryingSubmissionId === submission.submission_id ? 'Queuing…' : 'Re-run AI'}
                                  </button>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">No files</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                    No assignments match the current search and filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {aiSummaryModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-summary-title"
          onClick={() => setAiSummaryModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 id="ai-summary-title" className="text-lg font-bold text-[#08234a]">
                {aiSummaryModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setAiSummaryModal(null)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Extracted fields</p>
            <dl className="mt-4 space-y-3">
              {Object.entries(aiSummaryModal.data).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{key.replace(/_/g, ' ')}</dt>
                  <dd className="mt-1 text-sm font-semibold text-[#08234a]">
                    {value == null
                      ? '—'
                      : Array.isArray(value)
                        ? value.join(', ')
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {aiSummaryModal.remarks && (
              <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
                <span className="font-bold">Note: </span>
                {aiSummaryModal.remarks}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PresidentDashboard({ stats }: { stats: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard title="Total Users" value={stats?.total || 0} tone="bg-[#08234a]/10 text-[#08234a]" icon={Users} />
        <MetricCard title="Overall Completion" value="0%" tone="bg-emerald-50 text-emerald-700" icon={CheckCircle} />
        <MetricCard title="Active Departments" value={Object.keys(stats?.byDepartment || {}).length} tone="bg-[#d6b65d]/20 text-[#8a6a12]" icon={BarChart3} />
      </div>
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-bold text-[#08234a]">Role-wise Statistics</h3>
        <div className="mt-5 space-y-3">
          {stats?.byRole ? (
            Object.entries(stats.byRole).map(([role, count]: [string, any]) => (
              <div key={role} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="font-semibold text-slate-700">{role}</span>
                <span className="rounded-full bg-[#08234a] px-3 py-1 text-sm font-bold text-white">{count} users</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Statistics will appear after user data is available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
