"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "@/lib/notifications/falcon-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuthedApi } from "@/lib/api";
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
  FacultyErrorBanner,
} from "@/components/faculty";
import { cn } from "@/lib/utils";
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from "@/lib/faculty-demo-mode";
import { facultyDemoIqacTasks } from "@/lib/mock/faculty-portal-demo";

type Assignment = {
  assignment_id: string;
  status: string;
  due_date?: string;
  review_comments?: string | null;
  task?: {
    task_name?: string;
    task_description?: string;
    month?: string;
  };
  submissions?: {
    submission_id: string;
    file_name?: string;
    ai_status?: "PENDING" | "VALIDATED" | "REJECTED_MISMATCH" | null;
    ai_remarks?: string | null;
  }[];
};

function workflowStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_HOD_APPROVAL: 'Awaiting HOD approval',
    PENDING_IQAC_REVIEW: 'HOD approved · awaiting IQAC',
    CHANGES_REQUESTED: 'Changes requested',
    ACCEPTED: 'Accepted by IQAC',
    CLOSED: 'Closed',
    WAIVED: 'Waived',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

export default function FacultyIqacPage() {
  const api = useAuthedApi();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scope = useRef(0);
  const request = useRef(0);
  const uploadLock = useRef(false);

  const loadTasks = useCallback(async (version = scope.current) => {
    const requestId = ++request.current;
    const current = () => version === scope.current && requestId === request.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<Assignment[]>("/tasks/assignments/my");
      if (!current()) return;
      if (!Array.isArray(data)) throw new Error("Could not read IQAC tasks. Please retry.");
      const resolved = withFacultyDemoFallback(
        Array.isArray(data) ? data : [],
        facultyDemoIqacTasks() as Assignment[],
        isEmptyArray,
      );
      setAssignments(resolved);
      setSelectedAssignmentId(
        (current) => resolved.some((row) => row.assignment_id === current)
          ? current : resolved[0]?.assignment_id || "",
      );
    } catch (error) {
      if (!current()) return;
      const resolved = withFacultyDemoFallback(
        [],
        facultyDemoIqacTasks() as Assignment[],
        isEmptyArray,
      );
      if (resolved.length) {
        setAssignments(resolved);
        setSelectedAssignmentId(resolved[0]?.assignment_id || "");
      } else setLoadError(error instanceof Error ? error.message : "Failed to load IQAC tasks");
    } finally {
      if (current()) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const version = ++scope.current;
    // An account/API change invalidates task data and the evidence file before starting a scoped load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignments([]);
    setSelectedAssignmentId("");
    setFile(null);
    setUploading(false);
    uploadLock.current = false;
    void loadTasks(version);
    return () => { scope.current += 1; };
  }, [loadTasks]);

  async function uploadEvidence() {
    if (uploadLock.current || uploading || loading || loadError || !canSubmitSelected) return;
    if (!file || !selectedAssignmentId) {
      toast.error("Select a task and file first");
      return;
    }
    if (isFacultyDemoSmokeId(selectedAssignmentId)) {
      toast.success("Evidence uploaded for AI audit (demo)");
      setFile(null);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    const version = scope.current;
    const assignmentId = selectedAssignmentId;
    uploadLock.current = true;
    setUploading(true);
    try {
      const uploaded = await api.post<{ path?: string; url?: string; originalname?: string; size?: number; mimetype?: string }>(
        "/uploads/single", formData,
      );
      if (version !== scope.current) return;
      if (!uploaded.path && !uploaded.url) throw new Error("The upload did not return a file reference. Please retry.");
      await api.post(`/tasks/submissions/${assignmentId}`, {
        file_path: uploaded.path ?? uploaded.url,
        file_name: uploaded.originalname ?? file.name,
        file_size: uploaded.size ?? file.size,
        file_type: uploaded.mimetype ?? file.type,
      });
      if (version !== scope.current) return;
      toast.success("Evidence submitted to your HOD for review");
      setFile(null);
      await loadTasks(version);
    } catch (error) {
      if (version === scope.current) toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      if (version === scope.current) {
        uploadLock.current = false;
        setUploading(false);
      }
    }
  }

  const selectedAssignment = assignments.find(
    (item) => item.assignment_id === selectedAssignmentId,
  );
  const canSubmitSelected = Boolean(selectedAssignment && ['OPEN', 'PENDING', 'OVERDUE', 'CHANGES_REQUESTED'].includes(selectedAssignment.status.toUpperCase()));
  const submissionCount = assignments.reduce(
    (n, a) => n + (a.submissions?.length ?? 0),
    0,
  );

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Event & IQAC Reports"
        description="Upload the report and supporting documents for an assigned event or IQAC activity. Every submission goes to your department HOD first, then to IQAC."
        meta={
          !loading ? (
            <>
              <FacultyMetricChip
                label="Tasks"
                value={assignments.length}
                emphasis
              />
              <FacultyMetricChip label="Submissions" value={submissionCount} />
            </>
          ) : null
        }
      />

      {loading && <FacultyPageLoading label="Loading IQAC tasks…" branded />}
      {loadError && <><FacultyErrorBanner message={loadError} /><Button variant="outline" onClick={() => void loadTasks()}>Retry IQAC tasks</Button></>}

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <FacultyPanel
            title="Task list"
            count={assignments.length}
            description="Events and activities assigned to you"
          >
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <button
                  key={assignment.assignment_id}
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setSelectedAssignmentId(assignment.assignment_id);
                    setFile(null);
                  }}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left text-sm transition-colors",
                    selectedAssignmentId === assignment.assignment_id
                      ? "border-sgvu-gold/50 bg-sgvu-gold/10 shadow-sm"
                      : "border-border/60 hover:bg-muted/30",
                  )}
                >
                  <p className="font-semibold text-sgvu-navy">
                    {assignment.task?.task_name ?? "Compliance task"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.task?.month ?? "Current cycle"}
                  </p>
                  <Badge
                    className="mt-2"
                    variant={
                      ["ACCEPTED", "CLOSED", "WAIVED"].includes(
                        assignment.status,
                      )
                        ? "default"
                        : "secondary"
                    }
                  >
                    {workflowStatusLabel(assignment.status)}
                  </Badge>
                </button>
              ))}
              {!loadError && assignments.length === 0 && (
                <FacultyEmptyState
                  description="No IQAC tasks assigned."
                  className="py-6"
                />
              )}
            </div>
          </FacultyPanel>

          <FacultyPanel
            title="Upload event/activity report"
            description={
              selectedAssignment?.task?.task_description ??
              "Choose a task and upload supporting files"
            }
            className="lg:col-span-2"
          >
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-sgvu-gold" />
              <p className="mt-2 text-sm font-medium text-sgvu-navy">
                Upload report and supporting evidence
              </p>
              <Input
                key={selectedAssignmentId}
                className="mt-4 max-w-md mx-auto"
                type="file"
                disabled={uploading || Boolean(loadError) || !canSubmitSelected}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setFile(event.target.files?.[0] ?? null)
                }
              />
              {file && <p className="mt-2 text-sm">Selected file: {file.name}</p>}
            </div>
            <Button
              className="mt-4 w-full sm:w-auto gap-1.5"
              onClick={() => void uploadEvidence()}
              disabled={uploading || Boolean(loadError) || !file || !canSubmitSelected}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Submit to HOD
            </Button>
            {selectedAssignment && !canSubmitSelected && <p role="status" className="mt-3 text-sm text-muted-foreground">This task is closed or already under review. Evidence can be submitted for open tasks or requested changes.</p>}
            {selectedAssignment?.review_comments && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Reviewer feedback: {selectedAssignment.review_comments}
              </p>
            )}
          </FacultyPanel>

          <FacultyPanel
            title="HOD & IQAC review trail"
            count={submissionCount}
            description="Your report is reviewed by the HOD before IQAC can accept it"
            className="lg:col-span-3"
          >
            {submissionCount === 0 ? !loadError && (
              <FacultyEmptyState
                description="No evidence submitted yet."
                className="py-6"
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {assignments.flatMap((assignment) =>
                  (assignment.submissions ?? []).map((submission) => (
                    <div
                      key={submission.submission_id}
                      className="rounded-xl border border-border/60 p-4 text-sm"
                    >
                      <p className="font-semibold text-sgvu-navy">
                        {submission.file_name ?? "Uploaded evidence"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.task?.task_name}
                      </p>
                      <Badge
                        className="mt-2"
                        variant={
                          submission.ai_status === "VALIDATED"
                            ? "default"
                            : submission.ai_status === "REJECTED_MISMATCH"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {submission.ai_status ?? "N/A (Not PDF)"}
                      </Badge>
                      {submission.ai_remarks && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {submission.ai_remarks}
                        </p>
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
