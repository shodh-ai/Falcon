"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/lib/api";

type User = { user_id: string; name: string; email: string; role_name: string; dept_id: number | null };
type Department = { dept_id: number; dept_name: string; school_id: number | null };
type Snapshot = {
  config: null | { revision: number; structure: string; higher_officer_id: string | null;
    dean_enabled?: boolean; dean_user_id?: string | null };
  offices: Array<{ kind: string; user_id: string | null; name: string | null }>;
  staff_count: number;
  pending_count: number;
};
type Kind = "hod" | "principal" | "dean";

export function FlexibleLeadershipEditor() {
  const api = useAuthedApi();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId, setDeptId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState<Record<Kind, boolean>>({ hod: false, principal: false, dean: false });
  const [holders, setHolders] = useState<Record<Kind, string>>({ hod: "", principal: "", dean: "" });
  const [higher, setHigher] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api.get<{ departments: Department[] }>("/api/super-admin/hierarchy")
      .then((tree) => setDepartments(tree.departments ?? []))
      .catch(() => setMessage("Departments could not be loaded."));
  }, [api]);
  useEffect(() => {
    if (!deptId) { setSnapshot(null); return; }
    void api.get<Snapshot>(`/api/campus-admin/department-leadership/${deptId}/preview`)
      .then((next) => {
        setSnapshot(next);
        const hod = next.offices.find((o) => o.kind === "HOD")?.user_id ?? "";
        const principal = next.offices.find((o) => o.kind === "PRINCIPAL")?.user_id ?? "";
        const structure = next.config?.structure ?? "";
        setEnabled({ hod: structure.includes("HOD"), principal: structure.includes("PRINCIPAL"),
          dean: !!next.config?.dean_enabled });
        setHolders({ hod, principal, dean: next.config?.dean_user_id ?? "" });
        setHigher(next.config?.higher_officer_id ?? "");
      })
      .catch(() => setMessage("Leadership setup could not be loaded."));
  }, [api, deptId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const path = `/api/super-admin/hierarchy/assignable-users?q=${encodeURIComponent(search)}`;
      void Promise.all([
        api.get<User[]>(path),
        deptId ? api.get<User[]>(`${path}&dept_id=${deptId}`) : Promise.resolve([]),
      ]).then(([all, department]) =>
        setUsers([...new Map([...all, ...department].map((person) => [person.user_id, person])).values()]))
        .catch(() => setUsers([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [api, search, deptId]);

  const currentDept = departments.find((d) => String(d.dept_id) === deptId);
  const selected = (Object.keys(enabled) as Kind[]).filter((kind) => enabled[kind]);
  const { routineChain, escalationChain } = useMemo(() => {
    const routine = [enabled.hod && "HOD", enabled.principal && "Principal"]
      .filter(Boolean) as string[];
    if (!routine.length) routine.push(enabled.dean ? "Dean" : higher ? "Higher officer" : "No reporting officer");
    const escalation = [enabled.dean && "Dean", !!higher && "Higher officer"]
      .filter(Boolean) as string[];
    return { routineChain: routine, escalationChain: escalation };
  }, [enabled, higher]);
  const missing = selected.filter((kind) => !holders[kind]);
  const selectedIds = [...selected.map((kind) => holders[kind]), higher].filter(Boolean);
  const duplicate = new Set(selectedIds).size !== selectedIds.length;
  const noHigher = !higher && (enabled.dean || enabled.principal || enabled.hod);
  const invalid = missing.length > 0 || duplicate || !selectedIds.length || noHigher;
  const nameOf = (id: string) => users.find((person) => person.user_id === id)?.name
    ?? snapshot?.offices.find((office) => office.user_id === id)?.name ?? id;

  async function save() {
    if (!snapshot || !deptId || invalid) return;
    setBusy(true); setMessage("");
    try {
      const result = await api.put<{ revision: number; pending_rerouted: number }>(
        `/api/campus-admin/department-leadership/${deptId}/flexible`,
        {
          hod_user_id: enabled.hod ? holders.hod : null,
          principal_user_id: enabled.principal ? holders.principal : null,
          dean_user_id: enabled.dean ? holders.dean : null,
          higher_officer_id: higher || null,
        },
        { "If-Match": String(snapshot.config?.revision ?? 0),
          "Idempotency-Key": crypto.randomUUID() },
      );
      const refreshed = await api.get<Snapshot>(`/api/campus-admin/department-leadership/${deptId}/preview`);
      setSnapshot(refreshed);
      setMessage(`Saved revision ${result.revision}. ${result.pending_rerouted} pending request(s) rerouted; completed decisions were retained.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save leadership setup.");
    } finally { setBusy(false); }
  }

  const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm" aria-label="Department leadership setup">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-sgvu-navy">Department leadership</h2>
        <p className="mt-1 text-sm text-slate-600">Choose the reporting levels for each department. Changes affect pending requests and are recorded in the audit trail.</p>
      </div>
      <label className="block max-w-xl text-sm font-medium">Department
        <select className={`${control} mt-1`} value={deptId} onChange={(event) => { setDeptId(event.target.value); setMessage(""); }}>
          <option value="">Select a department</option>
          {departments.map((dept) => <option value={dept.dept_id} key={dept.dept_id}>{dept.dept_name}</option>)}
        </select>
      </label>
      {snapshot && currentDept && <>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {(["hod", "principal", "dean"] as Kind[]).map((kind) => <div className="rounded-xl border p-4" key={kind}>
            <label className="flex items-center justify-between gap-3 font-semibold text-sgvu-navy">
              <span>{kind === "hod" ? "HOD" : kind === "principal" ? "Principal" : "Dean"}</span>
              <input type="checkbox" role="switch" checked={enabled[kind]}
                onChange={(event) => setEnabled((value) => ({ ...value, [kind]: event.target.checked }))}
                aria-label={`Enable ${kind} for ${currentDept.dept_name}`} className="h-5 w-5 accent-sgvu-navy" />
            </label>
            <p className="my-2 text-xs text-slate-600">{kind === "hod" ? "Direct reporting officer for department staff" : kind === "principal" ? "Final routine approver and appeal reviewer across assigned departments" : "Oversight and higher appeals"}</p>
            {enabled[kind] && <select className={control} value={holders[kind]}
              onChange={(event) => setHolders((value) => ({ ...value, [kind]: event.target.value }))}
              aria-label={`Select ${kind} officeholder`}>
              <option value="">Select a person</option>
              {holders[kind] && !users.some((user) => user.user_id === holders[kind]) &&
                <option value={holders[kind]}>{nameOf(holders[kind])}</option>}
              {users.filter((user) => kind !== "hod" || user.dept_id === Number(deptId))
                .map((user) => <option key={user.user_id} value={user.user_id}>{user.name} · {user.email}</option>)}
            </select>}
          </div>)}
        </div>
        <label className="mt-4 block max-w-xl text-sm font-medium">Higher reporting officer
          <p className="mb-1 text-xs font-normal text-slate-600">The highest enabled leader reports here. This person must be outside the department.</p>
          <select className={control} value={higher} onChange={(event) => setHigher(event.target.value)}>
            <option value="">Select a person</option>
            {higher && !users.some((user) => user.user_id === higher) && <option value={higher}>{nameOf(higher)}</option>}
            {users.filter((user) => user.dept_id !== Number(deptId))
              .map((user) => <option key={user.user_id} value={user.user_id}>{user.name} · {user.email}</option>)}
          </select>
        </label>
        <label className="mt-4 block max-w-xl text-sm font-medium">Find a person
          <input className={`${control} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email" />
        </label>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <h3 className="font-semibold">Reporting preview</h3>
            <p className="mt-2 text-sm">Routine staff approval: Faculty and staff → {routineChain.join(" → ")}</p>
            <p className="mt-2 text-sm">Higher appeal and leader requests: {escalationChain.join(" → ") || "No higher office selected"}</p>
            <p className="mt-2 text-xs text-slate-600">These switches set reporting levels. They do not require every officer to approve every request.</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4 text-sm">
            <h3 className="font-semibold">Before saving</h3>
            <p>{snapshot.staff_count} staff member(s) will receive the new reporting chain.</p>
            <p>{snapshot.pending_count} pending HR request(s) will be rerouted. Past decisions stay in the audit history.</p>
            {missing.length > 0 && <p className="text-red-700">Select a person for: {missing.join(", ")}.</p>}
            {duplicate && <p className="text-red-700">Each level must have a different person.</p>}
            {noHigher && <p className="text-red-700">Select a higher officer so the highest leader also has a reporting officer.</p>}
          </div>
        </div>
        <button type="button" onClick={() => void save()} disabled={busy || invalid}
          className="mt-4 rounded-lg bg-sgvu-navy px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save leadership setup"}
        </button>
      </>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
