'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';

type Assignment = {
  assignment_id: string;
  status: string;
  due_date?: string;
  task?: {
    task_name?: string;
    task_description?: string;
    month?: string;
  };
  submissions?: {
    submission_id: string;
    file_name?: string;
    ai_status?: 'PENDING' | 'VALIDATED' | 'REJECTED_MISMATCH' | null;
    ai_remarks?: string | null;
  }[];
};

export default function FacultyIqacPage() {
  const { token } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function loadTasks() {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks/assignments/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Unable to load IQAC tasks');
      const data = await response.json();
      setAssignments(data);
      setSelectedAssignmentId((current) => current || data[0]?.assignment_id || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load IQAC tasks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [token]);

  async function uploadEvidence() {
    if (!token || !file || !selectedAssignmentId) {
      toast.error('Select a task and file first');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/uploads/single`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error('Upload failed');
      const uploaded = await uploadResponse.json();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks/submissions/${selectedAssignmentId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_path: uploaded.path ?? uploaded.url,
          file_name: uploaded.originalname ?? file.name,
          file_size: uploaded.size ?? file.size,
          file_type: uploaded.mimetype ?? file.type,
        }),
      });
      if (!response.ok) throw new Error('Evidence submission failed');
      toast.success('Evidence uploaded for AI audit');
      setFile(null);
      await loadTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const selectedAssignment = assignments.find((item) => item.assignment_id === selectedAssignmentId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">IQAC Compliance Tasks</h2>
        <p className="mt-1 text-sm text-muted-foreground">Upload evidence and track AI audit status from your faculty workspace.</p>
      </section>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin" />
          </CardContent>
        </Card>
      )}

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Task List</CardTitle>
              <CardDescription>Your assigned compliance duties</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignments.map((assignment) => (
                <button
                  key={assignment.assignment_id}
                  type="button"
                  onClick={() => setSelectedAssignmentId(assignment.assignment_id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${
                    selectedAssignmentId === assignment.assignment_id ? 'border-sgvu-gold bg-accent' : ''
                  }`}
                >
                  <p className="font-semibold text-sgvu-navy">{assignment.task?.task_name ?? 'Compliance task'}</p>
                  <p className="text-xs text-muted-foreground">{assignment.task?.month ?? 'Current cycle'}</p>
                  <Badge className="mt-2" variant={assignment.status === 'COMPLETED' ? 'success' : 'secondary'}>
                    {assignment.status}
                  </Badge>
                </button>
              ))}
              {assignments.length === 0 && <p className="text-sm text-muted-foreground">No IQAC tasks assigned.</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>File Upload Dropzone</CardTitle>
              <CardDescription>{selectedAssignment?.task?.task_description ?? 'Choose a task and upload supporting evidence.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-dashed p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-sgvu-gold" />
                <p className="mt-2 font-semibold">Upload compliance evidence</p>
                <Input
                  className="mt-4"
                  type="file"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <Button className="w-full" onClick={uploadEvidence} disabled={uploading || !file || !selectedAssignmentId}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Evidence'}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>AI Audit Status</CardTitle>
              <CardDescription>Recent submissions and validation results</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {assignments.flatMap((assignment) =>
                (assignment.submissions ?? []).map((submission) => (
                  <div key={submission.submission_id} className="rounded-xl border p-3 text-sm">
                    <p className="font-semibold text-sgvu-navy">{submission.file_name ?? 'Uploaded evidence'}</p>
                    <p className="text-xs text-muted-foreground">{assignment.task?.task_name}</p>
                    <Badge className="mt-2" variant={submission.ai_status === 'VALIDATED' ? 'success' : submission.ai_status === 'REJECTED_MISMATCH' ? 'destructive' : 'warning'}>
                      {submission.ai_status ?? 'PENDING'}
                    </Badge>
                    {submission.ai_remarks && <p className="mt-2 text-xs text-muted-foreground">{submission.ai_remarks}</p>}
                  </div>
                )),
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
