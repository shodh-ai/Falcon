"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";
type Item = {
  id: string;
  request_type: string;
  leave_type: string | null;
  applied_date: string | null;
  start_date?: string | null;
  end_date?: string | null;
  reason: string | null;
  status: string;
  employee: { name: string };
};
const types = [
  ["LEAVE", "Leave"],
  ["ON_DUTY", "On duty"],
  ["REGULARIZATION", "Regularisation"],
  ["COMP_OFF_CREDIT", "Comp-off"],
];
/** Assigned personal reporting work only. No HOD/Finance shortcuts or demo fallback. */
export function PrincipalReportingRequests() {
  const api = useAuthedApi(),
    [tab, setTab] = useState("LEAVE"),
    [rows, setRows] = useState<Item[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      setLoading(true);
      try {
        const result = await api.get<{ items: Item[] }>(
          `/api/hr/ess/team/requests?scope=direct&tab=${tab}`,
        );
        if (active()) {
          setRows(result.items);
          setError("");
        }
      } catch (e) {
        if (active()) {
          setRows([]);
          setError(
            e instanceof Error
              ? e.message
              : "Could not load reporting requests",
          );
        }
      } finally {
        if (active()) setLoading(false);
      }
    },
    [api, tab],
  );
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load(() => active);
    });
    return () => {
      active = false;
    };
  }, [load]);
  async function decide(id: string, action: "APPROVE" | "REJECT") {
    setBusy(true);
    setError("");
    try {
      await api.patch("/api/hr/ess/team/requests/bulk", {
        ids: [id],
        action,
        comment: notes[id],
        tab,
      });
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save reporting decision",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Assigned reporting requests</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Only the existing workflow's current decision owner may act. New
            routine requests go to HOD; previously assigned requests retain
            their recorded approver and downstream review.
          </p>
        </div>
        <button
          disabled={loading || busy}
          onClick={() => void load()}
          className="rounded-lg border px-4 py-2"
        >
          Refresh requests
        </button>
      </div>
      <label className="block max-w-sm text-sm">
        Request type
        <select
          className="mt-1 w-full rounded-lg border p-3"
          value={tab}
          disabled={busy}
          onChange={(e) => setTab(e.target.value)}
        >
          {types.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      ) : loading ? (
        <p role="status">Loading assigned requests…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No assigned pending requests of this type.
        </p>
      ) : (
        rows.map((row) => (
          <article className="space-y-3 rounded-lg border p-4" key={row.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-semibold">{row.employee.name}</h3>
              <span className="text-sm">{row.status}</span>
            </div>
            <p className="text-sm">
              {row.leave_type ?? row.request_type} ·{" "}
              {String(
                row.start_date ?? row.applied_date ?? "Date not supplied",
              ).slice(0, 10)}
              {row.end_date ? ` – ${String(row.end_date).slice(0, 10)}` : ""}
            </p>
            <p className="text-sm">{row.reason ?? "No reason supplied"}</p>
            <label className="block text-sm">
              Decision reason
              <textarea
                className="mt-1 w-full rounded-lg border p-3"
                minLength={5}
                maxLength={2000}
                value={notes[row.id] ?? ""}
                onChange={(e) =>
                  setNotes({ ...notes, [row.id]: e.target.value })
                }
              />
            </label>
            <div className="flex gap-2">
              {(["APPROVE", "REJECT"] as const).map((action) => (
                <button
                  key={action}
                  disabled={busy || (notes[row.id] ?? "").trim().length < 5}
                  onClick={() => void decide(row.id, action)}
                  className="rounded-lg border px-4 py-2 disabled:opacity-50"
                >
                  {action === "APPROVE"
                    ? "Approve assigned stage"
                    : "Reject request"}
                </button>
              ))}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
