"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UnlockRequest = {
  request_id: string;
  class_date: string;
  reason: string;
  requested_at: string;
  course_code: string;
  course_name: string;
  faculty_name: string;
  faculty_email: string | null;
  class_adjustment_id: string | null;
  section: string | null;
  start_time: string | null;
  end_time: string | null;
};

export default function HodAttendanceUnlockApprovalsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<UnlockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<UnlockRequest[]>(
        "/api/academics/hod/approvals/attendance-unlocks",
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setRows([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load attendance unlock requests",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void api
      .get<UnlockRequest[]>("/api/academics/hod/approvals/attendance-unlocks")
      .then((data) => {
        if (active) setRows(Array.isArray(data) ? data : []);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRows([]);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load attendance unlock requests",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function decide(
    requestId: string,
    action: "APPROVE" | "REJECT",
    comment?: string,
  ) {
    setActingId(requestId);
    try {
      const result = await api.patch<{ unlocked_until?: string | null }>(
        `/api/academics/hod/approvals/attendance-unlocks/${requestId}`,
        { action, remarks: comment },
      );
      toast.success(
        action === "APPROVE"
          ? `Attendance unlocked until ${new Date(result.unlocked_until!).toLocaleString()}`
          : "Attendance unlock request rejected",
      );
      setRejectId(null);
      setRemarks("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">
          Attendance Unlock Approvals
        </h2>
        <p className="text-sm text-muted-foreground">
          Review missed-attendance requests. Approval opens one limited marking
          window for the exact class only.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : null}
          {!loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending attendance unlock requests.
            </p>
          ) : null}
          {!loading && rows.length > 0 ? (
            <div className="space-y-3">
              {rows.map((row) => (
                <article key={row.request_id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-sgvu-navy">
                        {row.faculty_name} · {row.course_code}
                      </p>
                      <p className="text-muted-foreground">
                        {row.course_name} · Section{" "}
                        {row.section ?? "Whole course"} ·{" "}
                        {new Date(
                          `${row.class_date}T00:00:00`,
                        ).toLocaleDateString()}
                        {row.start_time
                          ? ` · ${row.start_time.slice(0, 5)}–${row.end_time?.slice(0, 5) ?? "?"}`
                          : ""}
                      </p>
                      <p>{row.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        Submitted {new Date(row.requested_at).toLocaleString()}
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Badge variant="outline">
                          {row.class_adjustment_id
                            ? "Approved extra class"
                            : "Regular class"}
                        </Badge>
                        <Badge variant="secondary">Missed attendance</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={Boolean(actingId)}
                        onClick={() => void decide(row.request_id, "APPROVE")}
                      >
                        {actingId === row.request_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Approve limited window"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={Boolean(actingId)}
                        onClick={() => setRejectId(row.request_id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(rejectId)}
        onOpenChange={(open) => !open && setRejectId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject attendance unlock</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Reason for rejection"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !rejectId || remarks.trim().length < 3 || Boolean(actingId)
              }
              onClick={() =>
                rejectId && void decide(rejectId, "REJECT", remarks.trim())
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
