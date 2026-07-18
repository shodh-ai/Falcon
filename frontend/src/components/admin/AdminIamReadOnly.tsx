'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Hierarchy = {
  campuses: { campus_id: number; campus_name: string }[];
  schools: { school_id: number; school_name: string; campus_id: number }[];
  departments: {
    dept_id: number;
    dept_name: string;
    school_id?: number | null;
    school_ids?: number[];
  }[];
  programs: { program_id: number; program_name: string; school_id: number }[];
  batches: { batch_id: string; batch_name: string }[];
};

type Assignment = {
  assignment_id: string;
  user_name: string;
  official_email: string;
  assignment_type: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
};

const TREE_KEYS = ['campuses', 'schools', 'departments', 'programs', 'batches'] as const;

export function AdminIamReadOnly() {
  const api = useAuthedApi();
  const [tree, setTree] = useState<Hierarchy | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [campuses, setCampuses] = useState<{ campus_id: number; campus_name: string }[]>([]);
  const [schools, setSchools] = useState<{ school_id: number; school_name: string }[]>([]);
  const [programs, setPrograms] = useState<{ program_id: number; program_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      api.get<Hierarchy>('/api/super-admin/hierarchy').catch(() => null),
      api.get<Assignment[]>('/api/super-admin/assignments').catch(() => []),
      api.get<{ campus_id: number; campus_name: string }[]>('/iam/campuses').catch(() => []),
      api.get<{ school_id: number; school_name: string }[]>('/iam/schools').catch(() => []),
      api.get<{ program_id: number; program_name: string }[]>('/iam/programs').catch(() => []),
    ])
      .then(([hierarchy, rows, c, s, p]) => {
        if (cancelled) return;
        setTree(hierarchy);
        setAssignments(rows ?? []);
        setCampuses(c ?? []);
        setSchools(s ?? []);
        setPrograms(p ?? []);
        if (!hierarchy && !c?.length) {
          setError('Unable to load hierarchy. Contact campus IT if this persists.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const schoolNameById = useMemo(
    () => new Map((tree?.schools ?? schools).map((s) => [String(s.school_id), s.school_name])),
    [tree?.schools, schools],
  );

  function assignmentLabel(row: Assignment) {
    if (row.entity_name?.trim()) return row.entity_name;
    if (row.entity_type?.toUpperCase() === 'SCHOOL') {
      return schoolNameById.get(String(row.entity_id)) ?? `School #${row.entity_id}`;
    }
    return `${row.entity_type} #${row.entity_id}`;
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading IAM & hierarchy…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-sgvu-navy">IAM & Hierarchy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of campuses, schools, programs, and dean/HOD assignments.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      {tree ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {TREE_KEYS.map((key) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-sm capitalize">{key}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {(tree[key] as Record<string, unknown>[]).map((item, i) => (
                  <div key={i} className="rounded border px-2 py-1">
                    {String(
                      Object.values(item).find((v) => typeof v === 'string' && !/^\d+$/.test(v)) ??
                        JSON.stringify(item),
                    )}
                  </div>
                ))}
                {!(tree[key] as unknown[]).length ? (
                  <p className="text-muted-foreground">None configured</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: 'Campuses', rows: campuses, label: (r: { campus_name: string }) => r.campus_name },
            { title: 'Schools', rows: schools, label: (r: { school_name: string }) => r.school_name },
            { title: 'Programs', rows: programs, label: (r: { program_name: string }) => r.program_name },
          ].map((block) => (
            <Card key={block.title}>
              <CardHeader>
                <CardTitle className="text-sm">{block.title}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {block.rows.map((row, i) => (
                  <div key={i} className="rounded border px-2 py-1">
                    {block.label(row as never)}
                  </div>
                ))}
                {!block.rows.length ? <p className="text-muted-foreground">None configured</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dean & HOD assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {assignments.map((row) => (
            <div key={row.assignment_id} className="rounded border px-3 py-2">
              <span className="font-medium">{row.user_name}</span>
              <span className="text-muted-foreground">
                {' '}
                · {row.assignment_type} on {assignmentLabel(row)}
              </span>
            </div>
          ))}
          {!assignments.length ? (
            <p className="text-muted-foreground">No dean/HOD assignments recorded yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
