"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedApi } from "@/lib/api";
export type OversightCase = {
  case_id: string;
  kind: "FOLLOW_UP" | "TIMETABLE";
  title: string;
  reason: string;
  status: string;
  revision: number;
  due_date?: string;
  note?: string;
  recommendation?: string;
  application_error?: string;
  updated_at: string;
  decision?: string;
};
type Move = {
  change_group_id: string;
  reason: string;
  sessions: {
    course_code: string;
    source_date: string;
    target_date: string;
    target_start_time: string;
    target_end_time: string;
  }[];
};
const label = (v: string) => v.toLowerCase().replaceAll("_", " ");
export function DepartmentCasesPanel({
  role = "principal",
  onlyEscalations = false,
}: {
  role?: "principal" | "hod";
  onlyEscalations?: boolean;
}) {
  const api = useAuthedApi(),
    base = `/api/academics/department-oversight/${role}/cases`;
  const [cases, setCases] = useState<OversightCase[]>([]),
    [moves, setMoves] = useState<Move[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""),
    [reason, setReason] = useState(""),
    [due, setDue] = useState(""),
    [source, setSource] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({});
  // Keep a failed command's key for safe retry; changed payload gets a new key.
  const command = useRef<{ signature: string; key: string } | null>(null);
  const keyFor = (signature: string) => {
    if (command.current?.signature !== signature)
      command.current = { signature, key: crypto.randomUUID() };
    return command.current!.key;
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ cases: OversightCase[] }>(base);
      setCases(data.cases);
      if (role === "hod")
        setMoves(
          await api.get<Move[]>("/api/academics/session-changes/hod/pending"),
        );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load department cases",
      );
    } finally {
      setLoading(false);
    }
  }, [api, base, role]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body =
      role === "principal"
        ? { kind: "FOLLOW_UP", title, reason, due_date: due }
        : { kind: "TIMETABLE", title, reason, source_id: source };
    try {
      await api.post(base, body, {
        "Idempotency-Key": keyFor(JSON.stringify(body)),
      });
      command.current = null;
      setTitle("");
      setReason("");
      setDue("");
      setSource("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }
  async function act(row: OversightCase, action: string) {
    setBusy(true);
    setError("");
    const body = { action, note: notes[row.case_id] ?? "" };
    try {
      await api.patch(`${base}/${row.case_id}`, body, {
        "If-Match": String(row.revision),
        "Idempotency-Key": keyFor(
          JSON.stringify({ id: row.case_id, revision: row.revision, ...body }),
        ),
      });
      command.current = null;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save decision");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-sgvu-navy">
            {role === "hod"
              ? "Principal escalations & follow-ups"
              : "Reserved decisions & follow-ups"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Routine decisions stay with HOD. Principal decisions retain all
            source validation and specialist controls.
          </p>
        </div>
        <button
          className="rounded-lg border px-4 py-2"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800"
        >
          {error}
        </p>
      )}
      <form
        onSubmit={create}
        className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-2"
      >
        <h3 className="font-semibold md:col-span-2">
          {role === "principal"
            ? "Assign a follow-up to HOD"
            : "Escalate an exceptional timetable request"}
        </h3>
        {role === "hod" && (
          <label className="md:col-span-2">
            Pending timetable request
            <select
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            >
              <option value="">Choose a pending request</option>
              {moves
                .filter(
                  (m) =>
                    !cases.some((c) => c.case_id === m.change_group_id && true),
                )
                .map((m) => (
                  <option key={m.change_group_id} value={m.change_group_id}>
                    {m.sessions.map((s) => s.course_code).join(" / ")} —{" "}
                    {m.reason}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Title
          <input
            required
            minLength={5}
            maxLength={2000}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        {role === "principal" && (
          <label>
            Response due
            <input
              required
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="mt-1 w-full rounded-lg border p-3"
            />
          </label>
        )}
        <label className="md:col-span-2">
          {role === "hod"
            ? "HOD recommendation and reason for escalation"
            : "Concern and required action"}
          <textarea
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3"
          />
        </label>
        <button
          disabled={busy || loading}
          className="w-fit rounded-lg bg-sgvu-navy px-5 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Submit"}
        </button>
      </form>
      {loading ? (
        <p role="status">Loading assigned cases…</p>
      ) : (
        <>
          {cases.filter((c) => !onlyEscalations || c.kind === "TIMETABLE")
            .length === 0 && (
            <p className="rounded-xl border bg-white p-5">
              No cases in this department.
            </p>
          )}
          {cases
            .filter((c) => !onlyEscalations || c.kind === "TIMETABLE")
            .map((row) => {
              const actions =
                role === "hod"
                  ? row.kind === "FOLLOW_UP" &&
                    ["PENDING_HOD", "RETURNED"].includes(row.status)
                    ? ["RESPOND"]
                    : row.kind === "TIMETABLE" && row.status === "RETURNED"
                      ? ["RESUBMIT"]
                      : []
                  : row.kind === "TIMETABLE"
                    ? row.status === "PENDING_PRINCIPAL"
                      ? ["APPROVE", "REJECT", "RETURN"]
                      : row.status === "APPLICATION_FAILED"
                        ? ["RETRY"]
                        : []
                    : row.status === "PENDING_PRINCIPAL"
                      ? ["CLOSE", "RETURN"]
                      : [];
              return (
                <article
                  key={row.case_id}
                  className="space-y-3 rounded-xl border bg-white p-5"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">{row.title}</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize">
                      {label(row.status)}
                    </span>
                  </header>
                  <p className="whitespace-pre-wrap text-sm">{row.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {label(row.kind)} · Revision {row.revision} ·{" "}
                    {row.due_date ? `Due ${row.due_date} · ` : ""}Updated{" "}
                    {new Date(row.updated_at).toLocaleString("en-IN")}
                  </p>
                  {row.recommendation && (
                    <p className="rounded-lg bg-slate-50 p-3 text-sm">
                      HOD response: {row.recommendation}
                    </p>
                  )}
                  {row.note && (
                    <p className="text-sm">
                      Latest decision / response: {row.note}
                    </p>
                  )}
                  {row.application_error && (
                    <p
                      role="alert"
                      className="rounded-lg bg-amber-50 p-3 text-amber-900"
                    >
                      {row.application_error} The official timetable has not
                      been changed by this attempt.
                    </p>
                  )}
                  {row.kind === "TIMETABLE" && (
                    <CaseEvidence
                      key={`${row.case_id}:${row.revision}`}
                      caseId={row.case_id}
                      role={role}
                    />
                  )}
                  {actions.length > 0 && (
                    <div className="space-y-3 border-t pt-3">
                      <label className="block text-sm">
                        Decision / response (required)
                        <textarea
                          minLength={5}
                          maxLength={2000}
                          rows={2}
                          value={notes[row.case_id] ?? ""}
                          onChange={(e) =>
                            setNotes({
                              ...notes,
                              [row.case_id]: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border p-3"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {actions.map((action) => (
                          <button
                            key={action}
                            disabled={
                              busy ||
                              (notes[row.case_id] ?? "").trim().length < 5
                            }
                            onClick={() => void act(row, action)}
                            className="rounded-lg border px-4 py-2 capitalize disabled:opacity-50"
                          >
                            {action === "RETRY"
                              ? `Retry ${row.decision === "REJECT" ? "rejection" : "application"}`
                              : label(action)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
        </>
      )}
    </section>
  );
}
function CaseEvidence({ caseId, role }: { caseId: string; role: string }) {
  const api = useAuthedApi();
  const [evidence, setEvidence] = useState<{
      sessions: Record<string, string>[];
      history: {
        status: string;
        note?: string;
        actor_name: string;
        updated_at: string;
      }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .get<typeof evidence>(
        `/api/academics/department-oversight/${role}/cases/${caseId}`,
      )
      .then((d) => {
        if (active) setEvidence(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, caseId, role]);
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Affected classes & decision history
      </summary>
      {error ? (
        <p role="alert">{error}</p>
      ) : !evidence ? (
        <p>Loading evidence…</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2 text-sm">
            {evidence.sessions.map((s, i) => (
              <li key={i}>
                {s.course_code} · {s.faculty_name} · {s.source_date} →{" "}
                {s.target_date} {s.target_start_time?.slice(0, 5)}–
                {s.target_end_time?.slice(0, 5)} ·{" "}
                {s.target_room ?? "Room not supplied"} · {s.status}
              </li>
            ))}
          </ul>
          <ol className="mt-4 space-y-2 border-t pt-3 text-xs">
            {evidence.history.map((h, i) => (
              <li key={i}>
                {new Date(h.updated_at).toLocaleString("en-IN")} ·{" "}
                {h.actor_name} · {label(h.status)}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Faculty, student-group, attendance and room checks run again before
            application. Approval cannot bypass a conflict.
          </p>
        </>
      )}
    </details>
  );
}
