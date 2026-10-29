"use client";
import { useState } from "react";
import { useAuthedApi } from "@/lib/api";
type State = {
  config: null | {
    structure: string;
    revision: number;
    higher_officer_id: string | null;
  };
  offices: {
    kind: string;
    login_alias: string;
    user_id: string | null;
    name: string | null;
  }[];
};
export function DepartmentLeadershipEditor() {
  const api = useAuthedApi();
  const [dept, setDept] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [structure, setStructure] = useState("HOD_ONLY");
  const [higher, setHigher] = useState("");
  const [kind, setKind] = useState("PRINCIPAL");
  const [alias, setAlias] = useState("");
  const [holder, setHolder] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const d = await api.get<State>(
      `/api/campus-admin/department-leadership/${dept}`,
    );
    setState(d);
    setStructure(d.config?.structure ?? "HOD_ONLY");
    setHigher(d.config?.higher_officer_id ?? "");
  };
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage("Saved. Refresh confirms the current configuration.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const rev = String(state?.config?.revision ?? 0);
  const control = "block w-full rounded border bg-white p-2";
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-lg font-semibold">
        Department leadership & officeholders
      </h2>
      <p className="text-sm text-muted-foreground">
        Office access is transferable; personal HR, teaching and approval
        history stay with the person. Changing an appointment signs the affected
        people out. Pending personal requests are not reassigned.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(load);
        }}
        className="flex gap-2"
      >
        <label className="grow">
          Department ID
          <input
            required
            type="number"
            min="1"
            className={control}
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              setState(null);
            }}
          />
        </label>
        <button disabled={busy} className="self-end rounded border px-4 py-2">
          Load
        </button>
      </form>
      {state && (
        <>
          <ul>
            {state.offices.map((o) => (
              <li key={o.kind}>
                {o.kind}: {o.name ?? "Unassigned"} · {o.login_alias}
              </li>
            ))}
          </ul>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await api.put(
                  `/api/campus-admin/department-leadership/${dept}`,
                  { structure, higher_officer_id: higher || null },
                  { "If-Match": rev },
                );
                await load();
              });
            }}
          >
            <label className="block">
              Structure
              <select
                className={control}
                value={structure}
                onChange={(e) => setStructure(e.target.value)}
              >
                <option value="HOD_ONLY">HOD only</option>
                <option value="PRINCIPAL_ONLY">Principal only</option>
                <option value="PRINCIPAL_HOD">Principal and HOD</option>
              </select>
            </label>
            <label className="block">
              Head's higher reporting officer (existing user UUID; optional
              until configured)
              <input
                className={control}
                value={higher}
                onChange={(e) => setHigher(e.target.value)}
              />
            </label>
            <button disabled={busy} className="rounded border px-4 py-2">
              Save structure
            </button>
          </form>
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await api.post(
                  `/api/campus-admin/department-leadership/${dept}/appointments`,
                  { kind, login_alias: alias, user_id: holder || null },
                  { "If-Match": rev },
                );
                await load();
              });
            }}
          >
            <label className="block">
              Office
              <select
                className={control}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option>PRINCIPAL</option>
                <option>HOD</option>
              </select>
            </label>
            <label className="block">
              Office login email
              <input
                required
                type="email"
                className={control}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </label>
            <label className="block">
              Officeholder user UUID (blank ends appointment)
              <input
                className={control}
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
              />
            </label>
            <button
              disabled={busy || !state.config}
              className="rounded border px-4 py-2"
            >
              Assign / end office appointment
            </button>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
