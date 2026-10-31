"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthedApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Pass = {
  pass_id: string;
  name: string;
  employee_id?: string;
  dept_name: string;
  out_time: string;
  expected_in_time: string;
  valid_now: boolean;
};
export default function GatePassCheck() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [passes, setPasses] = useState<Pass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  async function load() {
    setBusy(true);
    setPasses([]);
    setChecked(null);
    try {
      setPasses(
        await api.get(`/api/hr/gate-verification?q=${encodeURIComponent(q)}`),
      );
      setError(null);
      setChecked(new Date().toLocaleTimeString("en-IN"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify gate passes");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setPasses([]);
    setChecked(null);
  }, [q]);
  useEffect(() => {
    if (!checked) return;
    const timer = setTimeout(() => {
      setPasses([]);
      setChecked(null);
      setError("Verification expired. Check approved passes again.");
    }, 60000);
    return () => clearTimeout(timer);
  }, [checked]);
  if (!user)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Link href="/">Sign in with your Security account</Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">
        Gate pass verification
      </h1>
      <p className="text-sm text-slate-600">
        Match the person’s university ID with an approved pass. Refresh before
        allowing exit. Only passes in your campus scope appear.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Input
          aria-label="Find a gate pass"
          placeholder="Name, employee ID or pass ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button disabled={busy}>
          {busy ? "Checking…" : "Check approved passes"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {checked && (
        <p className="text-xs text-slate-500">
          Checked at {checked}. This screen does not grant or extend approval.
        </p>
      )}
      {passes.map((p) => (
        <article
          key={p.pass_id}
          className={`rounded-xl border p-4 ${p.valid_now ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
        >
          <p className="font-bold">
            {p.name} · {p.employee_id || "ID not recorded"}
          </p>
          <p>{p.dept_name}</p>
          <p className="mt-2 text-sm">
            {p.out_time.replace("T", " ").slice(0, 16)} →{" "}
            {p.expected_in_time.replace("T", " ").slice(0, 16)} (India time)
          </p>
          <p className="font-semibold">
            {p.valid_now
              ? "Approved · within exit window"
              : "Approved · outside exit window — do not allow exit using this pass"}
          </p>
          <p className="mt-2 break-all text-xs">Pass ID: {p.pass_id}</p>
        </article>
      ))}
      {checked && !passes.length && (
        <p>No matching approved passes for today.</p>
      )}
    </main>
  );
}
