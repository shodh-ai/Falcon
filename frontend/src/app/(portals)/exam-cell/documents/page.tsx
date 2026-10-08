'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function ExamCellDocumentsPage() {
  const api = useAuthedApi();
  const [repo, setRepo] = useState<RepoDoc[]>([]);
  const [studentDocs, setStudentDocs] = useState<StudentDoc[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [repoForm, setRepoForm] = useState({ title: '', category: 'NOTICE', file_url: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, d, w] = await Promise.all([
        api.get<RepoDoc[]>('/api/exam-cell/document-repository'),
        api.get<StudentDoc[]>('/api/exam-cell/student-documents'),
        api.get<WorkflowDef[]>('/api/exam-cell/workflows'),
      ]);
      setRepo(r);
      setStudentDocs(d);
      setWorkflows(w);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function uploadRepo() {
    if (!repoForm.title.trim()) {
      toast.error('Title required');
      return;
    }
    try {
      await api.post('/api/exam-cell/document-repository', repoForm);
      toast.success('Document added to repository');
      setRepoForm({ title: '', category: 'NOTICE', file_url: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  async function verifyDoc(docId: string, status: 'VERIFIED' | 'REJECTED') {
    try {
      await api.post(`/api/exam-cell/student-documents/${docId}/verify`, { status });
      toast.success(`Document ${status.toLowerCase()}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
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
          <Button size="sm" variant="outline" onClick={() => void verifyDoc(r.doc_id, 'VERIFIED')}>Verify</Button>
          <Button size="sm" variant="ghost" onClick={() => void verifyDoc(r.doc_id, 'REJECTED')}>Reject</Button>
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

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="space-y-2 py-3 text-sm">
          <p><strong>Three tabs:</strong></p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong>Document repository</strong> — COE notices, circulars, guidelines (title + optional file URL).</li>
            <li><strong>Student document verification</strong> — Approve or reject documents students uploaded for exam eligibility.</li>
            <li><strong>Workflow definitions</strong> — Read-only view of configured approval chains (hall ticket, results, etc.).</li>
          </ul>
        </CardContent>
      </Card>

      <Tabs defaultValue="repository">
        <TabsList>
          <TabsTrigger value="repository">Document repository</TabsTrigger>
          <TabsTrigger value="verification">Student document verification</TabsTrigger>
          <TabsTrigger value="workflows">Workflow definitions</TabsTrigger>
        </TabsList>

        <TabsContent value="repository" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add notice / circular</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Title" value={repoForm.title} onChange={(e) => setRepoForm((f) => ({ ...f, title: e.target.value }))} className="sm:col-span-2" />
              <Select className="rounded-md border px-3 py-2 text-sm" value={repoForm.category} onChange={(e) => setRepoForm((f) => ({ ...f, category: e.target.value }))}>
                {REPO_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </Select>
              <Input placeholder="File URL (optional)" value={repoForm.file_url} onChange={(e) => setRepoForm((f) => ({ ...f, file_url: e.target.value }))} />
              <Button onClick={() => void uploadRepo()} className="sm:col-span-2">Add to repository</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-6">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : repo.map((d) => (
                <div key={d.repository_id} className="flex items-center justify-between rounded border px-3 py-2">
                  <div><p className="font-medium text-sm">{d.title}</p><p className="text-xs text-muted-foreground">{d.category}</p></div>
                  <Badge variant="outline">{new Date(d.created_at).toLocaleDateString('en-IN')}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <Card>
            <CardContent className="pt-6">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                <DataTable columns={docColumns} rows={studentDocs} rowKey={(r) => r.doc_id} emptyMessage="No student examination documents pending verification." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows">
          <Card>
            <CardContent className="space-y-2 pt-6">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : workflows.length === 0 ? (
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
