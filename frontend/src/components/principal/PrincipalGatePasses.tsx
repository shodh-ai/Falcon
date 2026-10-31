"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";
type Pass = {
  pass_id: string;
  created_at?:string | null;
  out_time: string;
  expected_in_time: string;
  reason: string;
  staff: { name: string };
};
export function PrincipalGatePasses() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Pass[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setRows(await api.get<Pass[]>("/api/hr/gate-passes/pending-approvals"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (id: string, status: "APPROVED" | "REJECTED") => {
    setBusy(true);
    try {
      await api.patch(`/api/hr/gate-passes/${id}/action`, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save decision");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mx-auto mt-6 max-w-6xl rounded-xl border bg-white p-5">
      <h2 className="text-xl font-semibold">
        Gate passes - reporting approval
      </h2>
      <p className="text-sm text-muted-foreground">
        Only requests assigned to you are listed. Reporting approval does not
        replace final HR sign-off.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4">No pending gate passes.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li
              key={row.pass_id}
              className="flex flex-wrap items-center justify-between gap-4 border-b pb-3"
            >
              <div>
                <p>{row.staff.name}</p>
                <p>
                  {new Date(row.out_time).toLocaleString("en-IN")} -{" "}
                  {new Date(row.expected_in_time).toLocaleString("en-IN")}
                </p>
                <p>{row.reason}</p><p className="text-xs text-muted-foreground">Raised on {row.created_at ? new Date(row.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : 'Not recorded'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded border px-3 py-2"
                  disabled={busy}
                  onClick={() => void act(row.pass_id, "APPROVED")}
                >
                  Approve reporting stage
                </button>
                <button
                  className="rounded border px-3 py-2"
                  disabled={busy}
                  onClick={() => void act(row.pass_id, "REJECTED")}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
