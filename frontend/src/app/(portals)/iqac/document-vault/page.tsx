"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, RotateCcw } from "lucide-react";
import { IqacPageHeader } from "@/components/iqac/IqacPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthedApi } from "@/lib/api";
import { toast } from "@/lib/notifications/falcon-toast";

type Submission = {
  submission_id: string;
  file_name?: string;
  file_path?: string;
  evidence_type?: string;
  ai_status?: string | null;
};
type Assignment = {
  assignment_id: string;
  status: string;
  review_comments?: string | null;
  task?: { task_name?: string; owner_label?: string; month?: string };
  assigned_user?: { name?: string; department?: { dept_name?: string } };
  submissions?: Submission[];
};

export default function IqacDocumentVaultPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Assignment[]>("/tasks/assignments/all");
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load IQAC evidence",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewQueue = useMemo(
    () =>
      rows.filter((row) =>
        ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"].includes(row.status),
      ),
    [rows],
  );

  async function review(
    assignment: Assignment,
    decision: "ACCEPTED" | "CHANGES_REQUESTED",
  ) {
    setBusy(assignment.assignment_id);
    try {
      await api.post(`/tasks/assignments/${assignment.assignment_id}/review`, {
        decision,
        comments: comments[assignment.assignment_id]?.trim() || undefined,
      });
      toast.success(
        decision === "ACCEPTED" ? "Evidence accepted" : "Changes requested",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <IqacPageHeader
        title="Evidence Review Queue"
        description="Uploads remain submitted until an independent IQAC reviewer accepts them or requests corrections."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Awaiting review</p>
            <p className="text-2xl font-semibold">{reviewQueue.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Accepted</p>
            <p className="text-2xl font-semibold">
              {rows.filter((row) => row.status === "ACCEPTED").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-2xl font-semibold">
              {rows.filter((row) => row.status === "OVERDUE").length}
            </p>
          </CardContent>
        </Card>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading evidence…
        </div>
      ) : reviewQueue.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No submissions are waiting for review.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviewQueue.map((assignment) => (
            <Card key={assignment.assignment_id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {assignment.task?.task_name ?? "Compliance duty"}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {assignment.assigned_user?.name ?? "Unknown owner"} ·{" "}
                      {assignment.assigned_user?.department?.dept_name ??
                        assignment.task?.owner_label ??
                        "University office"}{" "}
                      · {assignment.task?.month}
                    </p>
                  </div>
                  <Badge
                    variant={
                      assignment.status === "CHANGES_REQUESTED"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {assignment.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2">
                  {(assignment.submissions ?? []).map((submission) => (
                    <a
                      key={submission.submission_id}
                      href={submission.file_path || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/30"
                    >
                      <FileText className="h-4 w-4 text-sgvu-gold" />
                      <span className="min-w-0 flex-1 truncate">
                        {submission.file_name ?? "Evidence file"}
                      </span>
                      <Badge variant="outline">
                        {submission.ai_status ??
                          submission.evidence_type ??
                          "EVIDENCE"}
                      </Badge>
                    </a>
                  ))}
                </div>
                <Input
                  placeholder="Reviewer comments (required when requesting changes)"
                  value={comments[assignment.assignment_id] ?? ""}
                  onChange={(event) =>
                    setComments((current) => ({
                      ...current,
                      [assignment.assignment_id]: event.target.value,
                    }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void review(assignment, "ACCEPTED")}
                    disabled={busy === assignment.assignment_id}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Accept evidence
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void review(assignment, "CHANGES_REQUESTED")}
                    disabled={
                      busy === assignment.assignment_id ||
                      !comments[assignment.assignment_id]?.trim()
                    }
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Request changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
