'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { formatWorkflowSteps } from '@/lib/exam-cell/format';

type RepoDoc = {
  repository_id: string;
  title: string;
  category: string;
  file_url: string | null;
  created_at: string;
};

type StudentDoc = {
  doc_id: string;
  student_name: string;
  enrollment_number: string | null;
  document_type: string;
  verification_status: string;
};

type WorkflowDef = {
  workflow_id: string;
  workflow_name: string;
  workflow_key?: string;
  workflow_type?: string;
  steps: unknown;
  is_active: boolean;
};

const REPO_CATEGORIES = ['NOTICE', 'CIRCULAR', 'GUIDELINE', 'QUESTION_PAPER', 'SAMPLE_PAPER', 'RESULT', 'POLICY'];
type DocumentResult = {
  api: ReturnType<typeof useAuthedApi>;
  revision: number;
  repo: RepoDoc[];
  studentDocs: StudentDoc[];
  workflows: WorkflowDef[];
  error: string | null;
};

export default function ExamCellDocumentsPage() {
  const api = useAuthedApi();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationPending = useRef(false);
  const currentResult = result?.api === api && result.revision === revision ? result : null;
  const loading = !currentResult;
  const error = currentResult?.error;
  const repo = currentResult?.repo ?? [];
  const studentDocs = currentResult?.studentDocs ?? [];
  const workflows = currentResult?.workflows ?? [];
  const [repoForm, setRepoForm] = useState({ title: '', category: 'NOTICE', file_url: '' });

  useEffect(() => {
    let current = true;
    void Promise.all([
        api.get<RepoDoc[]>('/api/exam-cell/document-repository'),
        api.get<StudentDoc[]>('/api/exam-cell/student-documents'),
        api.get<WorkflowDef[]>('/api/exam-cell/workflows'),
      ]).then(([loadedRepo, loadedStudentDocs, loadedWorkflows]) => {
        if (current) setResult({ api, revision, repo: loadedRepo, studentDocs: loadedStudentDocs, workflows: loadedWorkflows, error: null });
      }).catch((e: unknown) => {
        if (current) setResult({ api, revision, repo: [], studentDocs: [], workflows: [], error: e instanceof Error ? e.message : 'Failed to load documents' });
      });
    return () => { current = false; };
  }, [api, revision]);

  async function uploadRepo() {
    if (mutationPending.current) return;
    if (!repoForm.title.trim()) {
      toast.error('Title required');
      return;
    }
    mutationPending.current = true;
    setBusy(true);
    try {
      await api.post('/api/exam-cell/document-repository', repoForm);
      toast.success('Document added to repository');
      setRepoForm({ title: '', category: 'NOTICE', file_url: '' });
      setRevision((current) => current + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  async function verifyDoc(docId: string, status: 'VERIFIED' | 'REJECTED') {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/student-documents/${docId}/verify`, { status });
      toast.success(`Document ${status.toLowerCase()}`);
      setRevision((current) => current + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  const docColumns: DataTableColumn<StudentDoc>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'type', header: 'Document', render: (r) => r.document_type.replace(/_/g, ' ') },
    { key: 'status', header: 'Status', render: (r) => <Badge variant="outline">{r.verification_status}</Badge> },
    {
      key: 'actions',
      header: 'Verify',
      render: (r) => r.verification_status === 'PENDING' ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void verifyDoc(r.doc_id, 'VERIFIED')}>Verify</Button>
          <Button size="sm" variant="ghost" disabled={busy || loading} onClick={() => void verifyDoc(r.doc_id, 'REJECTED')}>Reject</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="documents" />
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>Could not load document tools: {error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setRevision((current) => current + 1)}>Retry documents</Button>
        </div>
      )}

      <Tabs defaultValue="repository" className="min-w-0">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList aria-label="Document tools" className="min-h-11 w-max justify-start gap-1 rounded-xl border border-sgvu-navy/10 bg-white p-1 shadow-sm">
            <TabsTrigger value="repository">Document repository</TabsTrigger>
            <TabsTrigger value="verification">Student document verification</TabsTrigger>
            <TabsTrigger value="workflows">Workflow definitions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="repository" className="space-y-4">
          <p className="text-sm text-muted-foreground">Manage notices, circulars, and guidelines with an optional file URL.</p>
          <Card>
            <CardHeader><CardTitle className="text-base">Add notice / circular</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Document title" placeholder="Title" disabled={busy} value={repoForm.title} onChange={(e) => setRepoForm((f) => ({ ...f, title: e.target.value }))} className="sm:col-span-2" />
              <Select aria-label="Document category" disabled={busy} className="rounded-md border px-3 py-2 text-sm" value={repoForm.category} onChange={(e) => setRepoForm((f) => ({ ...f, category: e.target.value }))}>
                {REPO_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </Select>
              <Input aria-label="Document file URL" placeholder="File URL (optional)" disabled={busy} value={repoForm.file_url} onChange={(e) => setRepoForm((f) => ({ ...f, file_url: e.target.value }))} />
              <Button disabled={busy} onClick={() => void uploadRepo()} className="sm:col-span-2">{busy ? 'Saving…' : 'Add to repository'}</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-6">
              {loading ? <div role="status" aria-label="Loading repository"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? null : repo.length === 0 ? (
                <p className="text-sm text-muted-foreground">No examination documents in the repository.</p>
              ) : repo.map((d) => (
                <div key={d.repository_id} className="flex items-center justify-between rounded border px-3 py-2">
                  <div><p className="font-medium text-sm">{d.title}</p><p className="text-xs text-muted-foreground">{d.category}</p></div>
                  <Badge variant="outline">{new Date(d.created_at).toLocaleDateString('en-IN')}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <p className="mb-3 text-sm text-muted-foreground">Approve or reject student documents submitted for examination eligibility.</p>
          <Card>
            <CardContent className="pt-6">
              {loading ? <div role="status" aria-label="Loading student documents"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? null : (
                <DataTable columns={docColumns} rows={studentDocs} rowKey={(r) => r.doc_id} emptyMessage="No student examination documents pending verification." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows">
          <p className="mb-3 text-sm text-muted-foreground">View the configured approval steps for hall tickets, results, and other workflows.</p>
          <Card>
            <CardContent className="space-y-2 pt-6">
              {loading ? <div role="status" aria-label="Loading workflows"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? null : workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active workflow definitions configured.</p>
              ) : workflows.map((w) => (
                <div key={w.workflow_id} className="rounded border px-3 py-2 text-sm">
                  <p className="font-medium">{w.workflow_name}</p>
                  <p className="text-xs text-muted-foreground">{(w.workflow_key ?? w.workflow_type ?? 'WORKFLOW').replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs">{formatWorkflowSteps(w.steps)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
