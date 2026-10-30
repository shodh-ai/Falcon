"use client";
import { useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";

export type PrincipalDepartment = { dept_id: number; dept_name: string; school_name: string;
  hod_name?: string | null; staff_count?: number };
export function usePrincipalDepartments() {
  const api = useAuthedApi();
  const [departments, setDepartments] = useState<PrincipalDepartment[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void api.get<PrincipalDepartment[]>("/api/academics/principal/offices")
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("Principal department list is unavailable");
        setDepartments(rows);
        setError("");
        const remembered = typeof window === "undefined" ? "" : sessionStorage.getItem("principal-department") ?? "";
        setSelected(rows.some((row) => String(row.dept_id) === remembered)
          ? remembered : String(rows[0]?.dept_id ?? ""));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Principal department list is unavailable"))
      .finally(() => setLoading(false));
  }, [api]);
  const choose = (value: string) => {
    setSelected(value);
    sessionStorage.setItem("principal-department", value);
  };
  return { departments, selected, choose, loading, error };
}

export function PrincipalDepartmentSummary({ departments, selected, choose }: {
  departments: PrincipalDepartment[]; selected: string; choose: (value: string) => void;
}) {
  return <section className="rounded-xl border bg-white p-4">
    <h2 className="mb-3 font-semibold text-sgvu-navy">Departments and HODs in your scope</h2>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {departments.map((department) => <button key={department.dept_id} type="button"
        onClick={() => choose(String(department.dept_id))}
        className={`rounded-lg border p-3 text-left text-sm ${selected === String(department.dept_id) ? 'border-sgvu-navy bg-slate-50' : ''}`}>
        <strong>{department.dept_name}</strong>
        <span className="block text-xs text-muted-foreground">{department.school_name}</span>
        <span className="mt-2 block">HOD: {department.hod_name || 'No HOD enabled'}</span>
        <span className="block">Staff: {department.staff_count ?? 0}</span>
      </button>)}
    </div>
  </section>;
}

export function PrincipalDepartmentPicker({ departments, selected, choose }: {
  departments: PrincipalDepartment[]; selected: string; choose: (value: string) => void;
}) {
  if (departments.length < 2) return null;
  return <label className="block text-sm font-semibold text-sgvu-navy">Department
    <select className="mt-1 block w-full max-w-md rounded-lg border bg-white px-3 py-2"
      value={selected} onChange={(event) => choose(event.target.value)}>
      {departments.map((dept) => <option key={dept.dept_id} value={dept.dept_id}>
        {dept.school_name} · {dept.dept_name}
      </option>)}
    </select>
  </label>;
}
