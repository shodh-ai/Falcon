"use client";

import { useEffect, useRef, useState } from "react";
import { useHrApi } from "@/lib/api/use-hr-api";
import { HrPageHeader } from "./HrPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Metric = {
  key: string;
  label: string;
  method: "COUNT" | "TARGET" | "DIRECT";
  unit: string;
  max_points: number;
  points_per_unit: number;
  target: number;
  evidence_required: boolean;
};
type Category = {
  key: string;
  label: string;
  weight: number;
  metrics: Metric[];
};
type Sheet = {
  scoring_mode?: "WEIGHTED_100" | "RAW_POINTS";
  categories: Category[];
};
type Policy = {
  policy_id: string;
  designation: string;
  assessment_year: number;
  title: string;
  sheet: Sheet;
  status: string;
  version: number;
  revision: number;
  is_current?: boolean;
};
type Data = {
  items: Policy[];
  employees: { user_id: string; name: string; designation: string }[];
  designations: string[];
  can_edit: boolean;
  template: {
    label: string;
    notice: string;
    reference_url: string;
    sheet: Sheet;
  };
};
type Draft = {
  designation: string;
  assessment_year: number;
  title: string;
  sheet: Sheet;
};
type Calculation = {
  total: number;
  maximum: number;
  complete: boolean;
  issues: string[];
  disclaimer: string;
  categories: {
    key: string;
    label: string;
    weight: number;
    earned_points: number;
    max_points: number;
    weighted_points: number;
    formula: string;
    metrics: {
      key: string;
      label: string;
      value: number | null;
      formula: string;
      earned_points: number;
      raw_points: number;
      max_points: number;
    }[];
  }[];
};
type SavedCalculation = {
  snapshot_id: string;
  sha256: string;
  created_at: string;
  snapshot: {
    employee: { name: string };
    policy: { version: number };
    calculation: Calculation;
  };
};
const control = "rounded-lg border bg-background px-3 py-2 text-sm";
const newKey = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const normalize = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

export function HrApiPolicyWorkspace() {
  const api = useHrApi();
  return <ApiPolicyEditor key={api.entityId ?? "no-entity"} api={api} />;
}

function ApiPolicyEditor({ api }: { api: ReturnType<typeof useHrApi> }) {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [inputs, setInputs] = useState<
    Record<string, { value: string; evidence: string }>
  >({});
  const [result, setResult] = useState<Calculation | null>(null);
  const [employee, setEmployee] = useState("");
  const [reference, setReference] = useState("");
  const [ack, setAck] = useState(false);
  const [history, setHistory] = useState<
    {
      action: string;
      revision: number;
      created_at: string;
      actor_user_id: string;
    }[]
  >([]);
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const createKey = useRef("");
  const calculationKey = useRef("");
  const scope = useRef<number | null>(api.entityId);
  const locked = selected?.status === "PUBLISHED" || !data?.can_edit;
  function reset(template: Data["template"], policy: Policy | null = null) {
    setSelected(policy);
    setDraft(
      policy
        ? structuredClone(policy)
        : {
            designation: "",
            assessment_year: new Date().getFullYear(),
            title: template.label,
            sheet: structuredClone(template.sheet),
          },
    );
    setInputs({});
    setResult(null);
    setEmployee("");
    setHistory([]);
    setCalculations([]);
    setReference("");
    setAck(false);
    setMessage("");
    setError("");
    createKey.current = crypto.randomUUID();
    calculationKey.current = crypto.randomUUID();
  }
  useEffect(() => {
    let active = true;
    scope.current = api.entityId;
    if (api.entityReady)
      void api
        .get<Data>("/api/hr/appraisal-policies")
        .then((value) => {
          if (active) {
            setData(value);
            reset(value.template);
          }
        })
        .catch((e) => {
          if (active)
            setError(
              e instanceof Error ? e.message : "Could not load API policies",
            );
        });
    return () => {
      active = false;
      scope.current = null;
    };
  }, [api]);
  async function run(work: () => Promise<void>) {
    const entity = scope.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (scope.current === entity)
        setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      if (scope.current === entity) setBusy(false);
    }
  }
  function change(next: Draft) {
    setDraft(next);
    setResult(null);
    setAck(false);
    calculationKey.current = crypto.randomUUID();
  }
  function categoryChange(index: number, next: Category) {
    if (draft)
      change({
        ...draft,
        sheet: {
          ...draft.sheet,
          categories: draft.sheet.categories.map((c, i) =>
            i === index ? next : c,
          ),
        },
      });
  }
  function inputChange(
    key: string,
    field: "value" | "evidence",
    value: string,
  ) {
    setInputs((old) => ({
      ...old,
      [key]: {
        value: old[key]?.value ?? "",
        evidence: old[key]?.evidence ?? "",
        [field]: value,
      },
    }));
    setResult(null);
    calculationKey.current = crypto.randomUUID();
  }
  const values = () =>
    Object.fromEntries(
      (draft?.sheet.categories ?? []).flatMap((c) =>
        c.metrics.map((m) => [
          m.key,
          {
            value: inputs[m.key]?.value?.trim()
              ? Number(inputs[m.key].value)
              : null,
            evidence: inputs[m.key]?.evidence ?? "",
          },
        ]),
      ),
    );
  async function save() {
    if (!draft) return;
    const entity = api.entityId;
    const saved = selected
      ? await api.patch<Policy>(
          `/api/hr/appraisal-policies/${selected.policy_id}`,
          { title: draft.title, sheet: draft.sheet },
          { "If-Match": String(selected.revision) },
        )
      : await api.post<Policy>(
          "/api/hr/appraisal-policies",
          { ...draft, from_template: true },
          { "Idempotency-Key": createKey.current },
        );
    if (scope.current !== entity) return;
    setSelected(saved);
    setDraft({ ...saved });
    setResult(null);
    setAck(false);
    const refreshed = await api.get<Data>("/api/hr/appraisal-policies");
    if (scope.current === entity) {
      setData(refreshed);
      setMessage("Draft saved. It is not active until HR publishes it.");
    }
  }
  async function preview() {
    if (!draft) return;
    const entity = api.entityId;
    const response = await api.post<{ calculation: Calculation }>(
      "/api/hr/appraisal-policies/preview",
      { sheet: draft.sheet, inputs: values() },
    );
    if (scope.current === entity) setResult(response.calculation);
  }
  async function publish() {
    if (!selected) return;
    const entity = api.entityId;
    const published = await api.post<Policy>(
      `/api/hr/appraisal-policies/${selected.policy_id}/publish`,
      { acknowledged: ack, approval_reference: reference },
      { "If-Match": String(selected.revision) },
    );
    if (scope.current !== entity) return;
    setSelected({ ...published, is_current: true });
    setDraft({ ...published });
    setResult(null);
    const refreshed = await api.get<Data>("/api/hr/appraisal-policies");
    if (scope.current === entity) {
      setData(refreshed);
      setMessage(
        "Policy published for this designation and year. Existing appraisal results were not changed.",
      );
    }
  }
  async function saveCalculation() {
    if (!selected) return;
    const entity = api.entityId;
    const saved = await api.post<{ snapshot_id: string; sha256: string }>(
      `/api/hr/appraisal-policies/${selected.policy_id}/calculations`,
      { employee_user_id: employee, inputs: values() },
      {
        "If-Match": String(selected.revision),
        "Idempotency-Key": calculationKey.current,
      },
    );
    if (scope.current === entity)
      setMessage(
        `Calculation saved: ${saved.snapshot_id}. SHA-256: ${saved.sha256}. This is not final appraisal approval.`,
      );
  }
  if (!api.entityReady)
    return <p>Select an organization to configure API rules.</p>;
  return (
    <div className="space-y-5">
      <HrPageHeader
        title="Designation API Policies"
        description="HR defines the scoring sheet by designation and assessment year. Preview every calculation before publishing rules. No automatic promotion, payroll or final appraisal decisions."
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 p-3 text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="break-words rounded-lg border border-green-200 p-3"
        >
          {message}
        </p>
      )}
      {!data || !draft ? (
        <div>
          <p>
            {error
              ? "Policies could not be loaded. Check that the local schema migration has been applied."
              : "Loading API policies…"}
          </p>
          {error && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const value = await api.get<Data>(
                    "/api/hr/appraisal-policies",
                  );
                  setData(value);
                  reset(value.template);
                })
              }
            >
              Retry loading policies
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p>{data.template.notice}</p>
            <a
              className="underline"
              href={data.template.reference_url}
              target="_blank"
              rel="noreferrer"
            >
              Historical UGC API category reference — not a current compliance
              certification
            </a>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Saved policy/version
              <select
                className={control}
                disabled={busy}
                value={selected?.policy_id ?? ""}
                onChange={(e) =>
                  reset(
                    data.template,
                    data.items.find((p) => p.policy_id === e.target.value) ??
                      null,
                  )
                }
              >
                <option value="">New illustrative draft</option>
                {data.items.map((p) => (
                  <option key={p.policy_id} value={p.policy_id}>
                    {p.designation} · {p.assessment_year} · v{p.version} ·{" "}
                    {p.status}
                    {p.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {data.can_edit && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const copy = draft;
                  reset(data.template);
                  setDraft(structuredClone(copy));
                }}
              >
                Copy into new draft/version
              </Button>
            )}
            {selected && (
              <span className="text-sm">
                {selected.status} · revision {selected.revision}. Published
                versions are immutable.
              </span>
            )}
          </div>
          <fieldset
            disabled={busy || locked}
            className="space-y-4 rounded-xl border p-4"
          >
            <legend className="px-2 font-semibold">Scoring sheet</legend>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">
                Designation
                <Input
                  list="api-designations"
                  disabled={!!selected}
                  value={draft.designation}
                  onChange={(e) =>
                    change({ ...draft, designation: e.target.value })
                  }
                />
              </label>
              <datalist id="api-designations">
                {data.designations.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <label className="grid gap-1 text-sm">
                Assessment year
                <Input
                  type="number"
                  min={2000}
                  max={2200}
                  disabled={!!selected}
                  value={draft.assessment_year}
                  onChange={(e) =>
                    change({
                      ...draft,
                      assessment_year: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Policy title
                <Input
                  value={draft.title}
                  maxLength={160}
                  onChange={(e) => change({ ...draft, title: e.target.value })}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              Scoring mode
              <select
                className={control}
                value={draft.sheet.scoring_mode ?? "WEIGHTED_100"}
                onChange={(e) =>
                  change({
                    ...draft,
                    sheet: {
                      ...draft.sheet,
                      scoring_mode: e.target.value as Sheet["scoring_mode"],
                    },
                  })
                }
              >
                <option value="WEIGHTED_100">Weighted score out of 100</option>
                <option value="RAW_POINTS">
                  Raw capped points (no normalization)
                </option>
              </select>
            </label>
            <p className="text-sm">
              {draft.sheet.scoring_mode === "RAW_POINTS"
                ? "Raw mode adds capped criterion points; category weights are ignored."
                : "Category weights must total 100%. Current total:"}{" "}
              <strong>
                {draft.sheet.scoring_mode === "RAW_POINTS"
                  ? ""
                  : `${draft.sheet.categories.reduce((sum, c) => sum + c.weight, 0)}%`}
              </strong>
              . Every metric is capped before category weighting.
            </p>
            {draft.sheet.categories.map((c, ci) => (
              <fieldset key={c.key} className="space-y-3 rounded-xl border p-4">
                <legend className="px-2">Category {ci + 1}</legend>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-sm">
                    Category name
                    <Input
                      value={c.label}
                      onChange={(e) =>
                        categoryChange(ci, { ...c, label: e.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Weight (%)
                    <Input
                      type="number"
                      min={0.01}
                      max={100}
                      disabled={draft.sheet.scoring_mode === "RAW_POINTS"}
                      step="0.01"
                      value={c.weight}
                      onChange={(e) =>
                        categoryChange(ci, {
                          ...c,
                          weight: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={() =>
                      change({
                        ...draft,
                        sheet: {
                          ...draft.sheet,
                          categories: draft.sheet.categories.filter(
                            (_, i) => i !== ci,
                          ),
                        },
                      })
                    }
                  >
                    Remove category
                  </Button>
                </div>
                {c.metrics.map((m, mi) => (
                  <div
                    className="grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4"
                    key={m.key}
                  >
                    <label className="grid gap-1 text-sm">
                      Criterion
                      <Input
                        value={m.label}
                        onChange={(e) =>
                          categoryChange(ci, {
                            ...c,
                            metrics: c.metrics.map((v, i) =>
                              i === mi ? { ...v, label: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Calculation method
                      <select
                        className={control}
                        value={m.method}
                        onChange={(e) =>
                          categoryChange(ci, {
                            ...c,
                            metrics: c.metrics.map((v, i) =>
                              i === mi
                                ? {
                                    ...v,
                                    method: e.target.value as Metric["method"],
                                  }
                                : v,
                            ),
                          })
                        }
                      >
                        <option value="COUNT">Count × points, capped</option>
                        <option value="TARGET">
                          Progress toward target, capped
                        </option>
                        <option value="DIRECT">Direct reviewed score</option>
                      </select>
                    </label>
                    {(
                      [
                        "unit",
                        "max_points",
                        ...(m.method === "COUNT"
                          ? ["points_per_unit"]
                          : m.method === "TARGET"
                            ? ["target"]
                            : []),
                      ] as const
                    ).map((field) => (
                      <label key={field} className="grid gap-1 text-sm">
                        {
                          (
                            {
                              unit: "Unit",
                              max_points: "Maximum points",
                              points_per_unit: "Points per item",
                              target: "Target",
                            } as Record<string, string>
                          )[field]
                        }
                        <Input
                          type={field === "unit" ? "text" : "number"}
                          step="any"
                          value={m[field as keyof Metric] as string | number}
                          onChange={(e) =>
                            categoryChange(ci, {
                              ...c,
                              metrics: c.metrics.map((v, i) =>
                                i === mi
                                  ? {
                                      ...v,
                                      [field]:
                                        field === "unit"
                                          ? e.target.value
                                          : Number(e.target.value),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={m.evidence_required}
                        onChange={(e) =>
                          categoryChange(ci, {
                            ...c,
                            metrics: c.metrics.map((v, i) =>
                              i === mi
                                ? { ...v, evidence_required: e.target.checked }
                                : v,
                            ),
                          })
                        }
                      />
                      Require evidence for positive claims
                    </label>
                    <Button
                      variant="outline"
                      onClick={() =>
                        categoryChange(ci, {
                          ...c,
                          metrics: c.metrics.filter((_, i) => i !== mi),
                        })
                      }
                    >
                      Remove criterion
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={
                    draft.sheet.categories.reduce(
                      (sum, v) => sum + v.metrics.length,
                      0,
                    ) >= 40
                  }
                  onClick={() =>
                    categoryChange(ci, {
                      ...c,
                      metrics: [
                        ...c.metrics,
                        {
                          key: newKey("metric"),
                          label: "New criterion",
                          method: "COUNT",
                          unit: "items",
                          max_points: 20,
                          points_per_unit: 5,
                          target: 1,
                          evidence_required: true,
                        },
                      ],
                    })
                  }
                >
                  Add criterion
                </Button>
              </fieldset>
            ))}
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={draft.sheet.categories.length >= 10}
                onClick={() =>
                  change({
                    ...draft,
                    sheet: {
                      ...draft.sheet,
                      categories: [
                        ...draft.sheet.categories,
                        {
                          key: newKey("category"),
                          label: "New category",
                          weight: 10,
                          metrics: [],
                        },
                      ],
                    },
                  })
                }
              >
                Add category
              </Button>
              <Button onClick={() => void run(save)}>Save draft</Button>
            </div>
          </fieldset>
          {selected?.status === "DRAFT" && data.can_edit && (
            <fieldset
              disabled={busy}
              className="grid gap-3 rounded-xl border p-4"
            >
              <legend className="px-2 font-semibold">
                Publish the saved revision
              </legend>
              <p className="text-sm">
                Save edits first. Publishing replaces the current
                designation/year assignment but never changes past calculations.
              </p>
              <label className="grid gap-1 text-sm">
                Institutional approval reference
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Committee decision / approved policy reference"
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                HR has reviewed these rules, including sample targets and
                weights, and has institutional approval.
              </label>
              <Button
                disabled={
                  !ack ||
                  reference.trim().length < 10 ||
                  JSON.stringify(draft.sheet) !==
                    JSON.stringify(selected.sheet) ||
                  draft.title !== selected.title
                }
                onClick={() => void run(publish)}
              >
                Publish saved policy
              </Button>
            </fieldset>
          )}
          <fieldset disabled={busy} className="space-y-3 rounded-xl border p-4">
            <legend className="px-2 font-semibold">
              Check the calculation
            </legend>
            <p className="text-sm">
              Enter 0 when there is no claim; blank means missing. Evidence
              references are recorded, not automatically verified. Current sheet
              preview does not save or approve an appraisal.
            </p>
            {draft.sheet.categories.map((c) => (
              <div key={c.key} className="space-y-2">
                <h3 className="font-semibold">
                  {c.label} (
                  {draft.sheet.scoring_mode === "RAW_POINTS"
                    ? "raw points"
                    : `${c.weight}%`}
                  )
                </h3>
                {c.metrics.map((m) => (
                  <div className="grid gap-3 sm:grid-cols-2" key={m.key}>
                    <label className="grid gap-1 text-sm">
                      {m.label} ({m.unit})
                      <Input
                        type="number"
                        min={0}
                        step={m.method === "COUNT" ? 1 : "any"}
                        value={inputs[m.key]?.value ?? ""}
                        onChange={(e) =>
                          inputChange(m.key, "value", e.target.value)
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Evidence reference — {m.label}
                      <Input
                        maxLength={1000}
                        value={inputs[m.key]?.evidence ?? ""}
                        onChange={(e) =>
                          inputChange(m.key, "evidence", e.target.value)
                        }
                        placeholder={
                          m.evidence_required
                            ? "Required for a positive claim"
                            : "Optional reference"
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            ))}
            <Button onClick={() => void run(preview)}>Calculate preview</Button>
            {result && (
              <div className="space-y-3" aria-live="polite">
                <h3 className="text-xl font-bold">
                  Calculated score: {result.total} / {result.maximum}
                </h3>
                <p>
                  {result.complete
                    ? "All values and required references supplied. HR still needs to inspect the evidence."
                    : "Incomplete preview — cannot save a calculation record."}
                </p>
                {result.issues.length > 0 && (
                  <ul className="list-disc pl-5">
                    {result.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
                {result.categories.map((c) => (
                  <div key={c.key} className="rounded-lg border p-3">
                    <h4 className="font-semibold">
                      {c.label}: {c.weighted_points} points contributed
                    </h4>
                    <p className="text-sm">
                      {c.formula}. Earned: {c.earned_points}; category cap:{" "}
                      {c.max_points}.
                    </p>
                    {c.metrics.map((m) => (
                      <p key={m.key} className="text-sm">
                        {m.label}: input {m.value ?? "missing"}; {m.formula};
                        raw {m.raw_points}, capped {m.earned_points}/
                        {m.max_points}.
                      </p>
                    ))}
                  </div>
                ))}
                <p className="text-sm">{result.disclaimer}</p>
              </div>
            )}
            {selected?.status === "PUBLISHED" && data.can_edit && (
              <div className="grid gap-3 border-t pt-3">
                <label className="grid gap-1 text-sm">
                  Employee for saved calculation (matching designation)
                  <select
                    className={control}
                    value={employee}
                    onChange={(e) => {
                      setEmployee(e.target.value);
                      calculationKey.current = crypto.randomUUID();
                    }}
                  >
                    <option value="">Select employee</option>
                    {data.employees
                      .filter(
                        (p) =>
                          normalize(p.designation ?? "") ===
                          normalize(selected.designation),
                      )
                      .map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.name} — {p.designation}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-xs">
                  Shows up to 500 staff within your authorized organization. An
                  absent employee may need designation or scope correction; no
                  mapping is guessed.
                </p>
                <Button
                  disabled={!employee || !result?.complete}
                  onClick={() => void run(saveCalculation)}
                >
                  Save immutable calculation record (not final approval)
                </Button>
              </div>
            )}
          </fieldset>
          {selected && (
            <div className="space-y-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const entity = api.entityId;
                    const rows = await api.get<typeof history>(
                      `/api/hr/appraisal-policies/${selected.policy_id}/history`,
                    );
                    if (scope.current === entity) setHistory(rows);
                  })
                }
              >
                Show activation and calculation audit history
              </Button>
              {history.map((event, i) => (
                <p key={`${event.action}-${i}`} className="text-sm">
                  {event.action} · revision {event.revision} ·{" "}
                  {event.created_at} · actor {event.actor_user_id}
                </p>
              ))}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const entity = api.entityId;
                    const rows = await api.get<SavedCalculation[]>(
                      `/api/hr/appraisal-policies/${selected.policy_id}/calculations`,
                    );
                    if (scope.current === entity) setCalculations(rows);
                  })
                }
              >
                Load recent saved calculations
              </Button>
              {calculations.map((record) => (
                <details
                  key={record.snapshot_id}
                  className="rounded-lg border p-3"
                >
                  <summary>
                    {record.snapshot.employee.name}:{" "}
                    {record.snapshot.calculation.total}/
                    {record.snapshot.calculation.maximum} · policy v
                    {record.snapshot.policy.version} · {record.created_at}
                  </summary>
                  <p className="break-words text-xs">
                    SHA-256: {record.sha256}. Saved calculation only, not final
                    appraisal approval.
                  </p>
                  {record.snapshot.calculation.categories.map((c) => (
                    <div key={c.key}>
                      <p>
                        {c.label}: {c.formula}; {c.weighted_points} points
                        contributed
                      </p>
                      {c.metrics.map((m) => (
                        <p key={m.key} className="text-sm">
                          {m.label}: {m.value ?? "missing"}; {m.formula};{" "}
                          {m.earned_points} points.
                        </p>
                      ))}
                    </div>
                  ))}
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
