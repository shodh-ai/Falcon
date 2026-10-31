"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/notifications/falcon-toast";
type Request = {
  request_id: string;
  faculty_name: string;
  course_code: string;
  class_date: string;
  session_key: string;
  status: string;
  reason: string;
  created_at: string;
  revision: number;
  expires_at?: string;
};
export function AttendanceReopeningPanel({
  hod = false,
  courseId,
  sessionKey,
  date,
}: {
  hod?: boolean;
  courseId?: string;
  sessionKey?: string;
  date?: string;
}) {
  const api = useAuthedApi();
  const [requests, setRequests] = useState<Request[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRequests(
        await api.get(
          `/api/academics/${hod ? "hod" : "faculty"}/attendance-reopening`,
        ),
      );
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load reopening requests",
      );
    }
  }, [api, hod]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(request?: Request, action?: string) {
    const reason = reasons[request?.request_id || "new"] || "";
    if (reason.trim().length < 10)
      return toast.error("Give a reason of at least 10 characters");
    setBusy(true);
    try {
      if (request)
        await api.post(
          `/api/academics/hod/attendance-reopening/${request.request_id}/decision`,
          { action, reason },
          { "If-Match": String(request.revision) },
        );
      else
        await api.post(
          "/api/academics/faculty/attendance-reopening",
          {
            course_id: courseId,
            session_key: sessionKey,
            class_date: date,
            reason,
          },
          { "Idempotency-Key": crypto.randomUUID() },
        );
      await load();
      toast.success(
        request ? "Decision saved" : "Reopening request sent to HOD",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save request");
    } finally {
      setBusy(false);
    }
  }
  const input = (key: string) => (
    <Input
      aria-label={key === "new" ? "Reopening reason" : "Decision reason"}
      placeholder="Explain the reason (at least 10 characters)"
      value={reasons[key] || ""}
      maxLength={2000}
      onChange={(e) => setReasons((s) => ({ ...s, [key]: e.target.value }))}
    />
  );
  const visible = hod
    ? requests
    : requests.filter(
        (r) =>
          r.session_key === sessionKey && r.class_date.slice(0, 10) === date,
      );
  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
      <h3 className="font-semibold text-sgvu-navy">Attendance reopening</h3>
      <p className="text-sm text-slate-600">
        HOD approval opens only this class and date for 24 hours. Corrections
        are audited; approval does not mark students present.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {!hod && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {input("new")}
          <Button
            disabled={
              busy || !sessionKey || visible.some((r) => r.status === "PENDING")
            }
            onClick={() => void submit()}
          >
            Request HOD approval
          </Button>
        </div>
      )}
      {visible.map((r) => (
        <article
          key={r.request_id}
          className="space-y-2 rounded-lg border bg-white p-3 text-sm"
        >
          <p>
            <strong>{r.course_code}</strong> · {r.class_date.slice(0, 10)} ·{" "}
            {r.faculty_name}
          </p>
          <p>{r.reason}</p>
          <p className="text-xs text-slate-500">
            Raised on{" "}
            {new Date(r.created_at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            · {r.status}
            {r.expires_at
              ? ` · Open until ${new Date(r.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
              : ""}
          </p>
          {hod && r.status === "PENDING" && (
            <>
              {input(r.request_id)}
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  onClick={() => void submit(r, "APPROVE")}
                >
                  Open for 24 hours
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void submit(r, "REJECT")}
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </article>
      ))}
      {hod && !error && !visible.length && (
        <p className="text-sm text-slate-500">
          No reopening requests in your department.
        </p>
      )}
    </section>
  );
}
