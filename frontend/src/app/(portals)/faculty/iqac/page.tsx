'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { cn } from '@/lib/utils';

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
  const submissionCount = assignments.reduce((n, a) => n + (a.submissions?.length ?? 0), 0);

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Upload evidence and track AI audit status from your faculty workspace."
        meta={
          !loading ? (
            <>
              <FacultyMetricChip label="Tasks" value={assignments.length} emphasis />
              <FacultyMetricChip label="Submissions" value={submissionCount} />
            </>
          ) : null
        }
      />

      {loading && <FacultyPageLoading label="Loading IQAC tasks…" branded />}

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <FacultyPanel title="Task list" count={assignments.length} description="Your assigned compliance duties">
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <button
                  key={assignment.assignment_id}
                  type="button"
                  onClick={() => setSelectedAssignmentId(assignment.assignment_id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left text-sm transition-colors',
                    selectedAssignmentId === assignment.assignment_id
                      ? 'border-sgvu-gold/50 bg-sgvu-gold/10 shadow-sm'
                      : 'border-border/60 hover:bg-muted/30',
                  )}
                >
                  <p className="font-semibold text-sgvu-navy">{assignment.task?.task_name ?? 'Compliance task'}</p>
                  <p className="text-xs text-muted-foreground">{assignment.task?.month ?? 'Current cycle'}</p>
                  <Badge
                    className="mt-2"
                    variant={assignment.status === 'COMPLETED' ? 'default' : 'secondary'}
                  >
                    {assignment.status}
                  </Badge>
                </button>
              ))}
              {assignments.length === 0 && (
                <FacultyEmptyState description="No IQAC tasks assigned." className="py-6" />
              )}
            </div>
          </FacultyPanel>

          <FacultyPanel
            title="Upload evidence"
            description={selectedAssignment?.task?.task_description ?? 'Choose a task and upload supporting files'}
            className="lg:col-span-2"
          >
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-sgvu-gold" />
              <p className="mt-2 text-sm font-medium text-sgvu-navy">Upload compliance evidence</p>
              <Input
                className="mt-4 max-w-md mx-auto"
                type="file"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              className="mt-4 w-full sm:w-auto gap-1.5"
              onClick={uploadEvidence}
              disabled={uploading || !file || !selectedAssignmentId}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Submit evidence
            </Button>
          </FacultyPanel>

          <FacultyPanel
            title="AI audit status"
            count={submissionCount}
            description="Recent submissions and validation results"
            className="lg:col-span-3"
          >
            {submissionCount === 0 ? (
              <FacultyEmptyState description="No evidence submitted yet." className="py-6" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {assignments.flatMap((assignment) =>
                  (assignment.submissions ?? []).map((submission) => (
                    <div key={submission.submission_id} className="rounded-xl border border-border/60 p-4 text-sm">
                      <p className="font-semibold text-sgvu-navy">{submission.file_name ?? 'Uploaded evidence'}</p>
                      <p className="text-xs text-muted-foreground">{assignment.task?.task_name}</p>
                      <Badge
                        className="mt-2"
                        variant={
                          submission.ai_status === 'VALIDATED'
                            ? 'default'
                            : submission.ai_status === 'REJECTED_MISMATCH'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {submission.ai_status ?? 'PENDING'}
                      </Badge>
                      {submission.ai_remarks && (
                        <p className="mt-2 text-xs text-muted-foreground">{submission.ai_remarks}</p>
                      )}
                    </div>
                  )),
                )}
              </div>
            )}
          </FacultyPanel>
        </div>
      )}
    </FacultyPageShell>
  );
}
