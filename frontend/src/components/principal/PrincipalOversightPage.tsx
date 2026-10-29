"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import {
  DepartmentCasesPanel,
  type OversightCase,
} from "./DepartmentCasesPanel";
type Row = Record<string, string | number | null>;
type Overview = {
  office: { login_alias: string; dept_id: number };
  academic_year: string;
  workload: Row[];
  timetable: Row[];
  cases: OversightCase[];
  totals?:{pending_principal:number;failed_applications:number;open_followups:number};
  attendance: Row[];
  syllabus?: Row[];
  publishedMarks?: Row[];
  iqac?: Row[];
  audit: {
    event_id: string;
    action: string;
    created_at: string;
    actor_name: string;
    details: {
      status?: string;
      title?: string;
      note?: string;
      revision?: number;
      case_id?: string;
    };
  }[];
};
type Directory = { staff: Row[]; students: Row[]; courses: Row[] };
export type PrincipalView =
  | "dashboard"
  | "department"
  | "operations"
  | "performance"
  | "workload"
  | "audit"
  | "reports"
  | "exceptions";
const headings: Record<PrincipalView, string> = {
  dashboard: "Executive Dashboard",
  department: "Department Overview",
  operations: "Academic Operations",
  performance: "Academic Performance",
  workload: "Faculty & Workload Oversight",
  audit: "Compliance & Audit",
  reports: "Department Reports",
  exceptions: "Escalations & Follow-ups",
};
export function duration(value: unknown) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(n / 60)}h ${n % 60}m`;
}
function Table({
  rows,
  columns,
  empty = "No records available.",
}: {
  rows: Row[];
  columns: [string, string][];
  empty?: string;
}) {
  return rows.length === 0 ? (
    <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
      {empty}
    </p>
  ) : (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map(([k, title]) => (
              <th key={k} className="px-4 py-3 font-semibold text-sgvu-navy">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={String(
                row.user_id ?? row.timetable_id ?? row.course_id ?? i,
              )}
              className="border-t"
            >
              {columns.map(([k]) => (
                <td key={k} className="px-4 py-3 align-top">
                  {String(row[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function PrincipalOversightPage({ view }: { view: PrincipalView }) {
  const api = useAuthedApi();
  const [data, setData] = useState<Overview | null>(null),
    [directory, setDirectory] = useState<Directory | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<Overview>(
        "/api/academics/department-oversight/principal",
      );
      setData(result);
      if (view === "department")
        setDirectory(
          await api.get<Directory>("/api/academics/principal/overview"),
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load department oversight",
      );
      setData(null);
      setDirectory(null);
    } finally {
      setLoading(false);
    }
  }, [api, view]);
  useEffect(() => {
    void load();
  }, [load]);
  const filter = (rows: Row[]) =>
    rows.filter((r) =>
      Object.values(r).join(" ").toLowerCase().includes(search.toLowerCase()),
    );
  const pending =
    data?.totals?.pending_principal ?? data?.cases.filter((c) => c.status === "PENDING_PRINCIPAL").length ?? 0;
  const failed =
    data?.totals?.failed_applications ?? data?.cases.filter((c) => c.status === "APPLICATION_FAILED").length ?? 0;
  const held =
    data?.workload.reduce(
      (sum, r) => sum + Number(r.pending_sessions ?? 0),
      0,
    ) ?? 0;
  const workload =
    data?.workload.map((r) => ({
      ...r,
      scheduled: duration(r.scheduled_minutes),
      pending: duration(r.pending_minutes),
      mapping:
        Number(r.pending_sessions) > 0
          ? "Awaiting confirmation"
          : Number(r.unscheduled_course_count) > 0
            ? "Schedule missing"
            : r.load_declaration_status === "NO_TEACHING_LOAD"
              ? "Approved no teaching load"
              : Number(r.course_count) === 0
                ? "No active allocation"
                : "Scheduled",
    })) ?? [];
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sgvu-navy">
            {headings[view]}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Department oversight and reserved decisions. HOD manages routine
            academic operations; HR, Finance, IQAC and examination authorities
            retain their specialist decisions.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border bg-white px-4 py-2"
        >
          Refresh data
        </button>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </p>
      ) : loading ? (
        <p role="status">Loading authorized department data…</p>
      ) : (
        data && (
          <>
            <p className="text-sm text-muted-foreground">
              Department {data.office.dept_id} · {data.office.login_alias} ·
              Academic year {data.academic_year}
            </p>
            {view === "dashboard" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Pending my decision",
                      value: pending,
                      href: "/principal/inbox",
                      detail: "Only reserved cases and follow-up responses",
                    },
                    {
                      label: "Open follow-ups",
                      value: data.cases.filter(
                        (c) => c.kind === "FOLLOW_UP" && c.status !== "CLOSED",
                      ).length,
                      href: "/principal/exceptions",
                      detail: "Actions assigned to HOD",
                    },
                    {
                      label: "Application failures",
                      value: failed,
                      href: "/principal/inbox",
                      detail: "Approval recorded; official change not applied",
                    },
                    {
                      label: "Held teaching sessions",
                      value: held,
                      href: "/principal/workload",
                      detail:
                        "Awaiting department confirmation; excluded from verified load",
                    },
                  ].map((card) => (
                    <Link
                      href={card.href}
                      key={card.label}
                      className="rounded-xl border bg-white p-5 shadow-sm hover:border-sgvu-gold"
                    >
                      <p className="text-sm font-medium">{card.label}</p>
                      <p className="mt-2 text-3xl font-bold text-sgvu-navy">
                        {card.value}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {card.detail}
                      </p>
                    </Link>
                  ))}
                </div>
                <section className="rounded-xl border bg-white p-5">
                  <h2 className="font-bold">Department at a glance</h2>
                  <p className="mt-3">
                    {data.workload.length} teaching staff ·{" "}
                    {data.timetable.length} confirmed weekly sessions ·{" "}
                    {data.attendance.reduce(
                      (n, r) => n + Number(r.recorded_sessions),
                      0,
                    )}{" "}
                    recorded attendance sessions this academic year
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Recorded sessions are evidence of attendance submission, not
                    a student attendance percentage. Missing records do not mean
                    students were absent.
                  </p>
                </section>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="rounded-lg border bg-white px-4 py-3"
                    href="/principal/operations"
                  >
                    Review department timetable
                  </Link>
                  <Link
                    className="rounded-lg border bg-white px-4 py-3"
                    href="/principal/performance"
                  >
                    Review academic evidence
                  </Link>
                </div>
              </>
            )}
            {[
              "department",
              "operations",
              "performance",
              "workload",
              "reports",
            ].includes(view) && (
              <label className="block max-w-xl text-sm font-medium">
                Search this view
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-2 w-full rounded-lg border bg-white p-3"
                  placeholder="Faculty, SID, course or programme"
                />
              </label>
            )}
            {view === "department" && directory && (
              <div className="space-y-6">
                {[
                  {
                    label: "Faculty & staff",
                    rows: directory.staff,
                    columns: [
                      ["name", "Name"],
                      ["official_email", "Personal identity"],
                    ],
                  },
                  {
                    label: "Students",
                    rows: directory.students,
                    columns: [
                      ["name", "Name"],
                      ["student_login_id", "SID"],
                      ["enrollment_no", "Enrollment"],
                    ],
                  },
                  {
                    label: "Courses & subjects",
                    rows: directory.courses,
                    columns: [
                      ["course_code", "Code"],
                      ["course_name", "Course / subject"],
                    ],
                  },
                ].map((group) => (
                  <section key={group.label}>
                    <h2 className="mb-3 text-lg font-bold">
                      {group.label} ({group.rows.length})
                    </h2>
                    <Table
                      rows={filter(group.rows)}
                      columns={group.columns as [string, string][]}
                    />
                  </section>
                ))}
              </div>
            )}
            {view === "operations" && (
              <>
                <p className="rounded-lg bg-amber-50 p-4 text-sm">
                  Confirmed recurring timetable. Dated changes use the same
                  authoritative class-move records as Faculty, Student and
                  attendance views. Missing or held mappings need HOD
                  resolution.
                </p>
                <Table
                  rows={filter(data.timetable).map((r) => ({
                    ...r,
                    day:
                      [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ][Number(r.day_of_week)] ?? r.day_of_week,
                    time: `${String(r.start_time).slice(0, 5)}–${String(r.end_time).slice(0, 5)}`,
                  }))}
                  columns={[
                    ["day", "Day"],
                    ["time", "Exact time"],
                    ["course_code", "Subject"],
                    ["faculty_name", "Faculty"],
                    ["section", "Section / batch"],
                    ["room", "Room"],
                    ["program_name", "Programme"],
                  ]}
                />
              </>
            )}
            {(view === "workload" || view === "reports") && (
              <>
                <h2 className="text-lg font-bold">Confirmed teaching load</h2>
                <Table
                  rows={filter(workload)}
                  columns={[
                    ["name", "Faculty"],
                    ["scheduled", "Scheduled / week"],
                    ["course_count", "Courses"],
                    ["mapping", "Mapping status"],
                    ["pending_sessions", "Held sessions"],
                    ["pending", "Excluded pending duration"],
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  No credit-to-hour estimates or unapproved utilization
                  thresholds. Approved no-load declarations are retained;
                  pending schedules are not represented as verified zero load.
                </p>
              </>
            )}
            {(view === "performance" || view === "reports") && (
              <>
                <h2 className="text-lg font-bold">Attendance evidence</h2>
                <Table
                  rows={filter(data.attendance)}
                  columns={[
                    ["course_code", "Subject"],
                    ["course_name", "Course"],
                    ["recorded_sessions", "Recorded sessions"],
                    ["last_recorded", "Latest attendance date"],
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  Submission totals only. Student marks, unpublished results and
                  academic holds remain under existing examination controls.
                </p>
              </>
            )}
            {(view === "performance" || view === "reports") && (
              <>
                <h2 className="text-lg font-bold">Syllabus progress</h2>
                <Table
                  rows={filter(data.syllabus ?? [])}
                  columns={[
                    ["course_code", "Subject"],
                    ["course_name", "Course"],
                    ["completed_units", "Completed units"],
                    ["units", "Total recorded units"],
                  ]}
                />
                <h2 className="text-lg font-bold">
                  Published coursework evidence
                </h2>
                <Table
                  rows={filter(data.publishedMarks ?? [])}
                  columns={[
                    ["course_code", "Subject"],
                    ["published_mark_records", "Published assessment records"],
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  Counts only; no student scores or held examination results are
                  exposed.
                </p>
              </>
            )}
            {(view === "audit" || view === "reports") && (
              <>
                <h2 className="text-lg font-bold">IQAC submission progress</h2>
                <Table
                  rows={data.iqac ?? []}
                  columns={[
                    ["status", "Existing workflow status"],
                    ["assignments", "Assignments"],
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  HOD reviews evidence; IQAC retains final review. This view
                  grants no additional decisions.
                </p>
              </>
            )}
            {view === "exceptions" && <DepartmentCasesPanel />}
            {view === "audit" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Latest 100 oversight events, including decisions and
                  application or delivery failures. Historical actors are
                  retained after an officeholder changes.
                </p>
                <Table
                  rows={data.audit.map((e) => ({
                    event_id: e.event_id,
                    date: new Date(e.created_at).toLocaleString("en-IN"),
                    actor: e.actor_name,
                    action: e.action,
                    status: e.details.status ?? "Delivery failure",
                    title: e.details.title ?? e.details.case_id ?? "",
                    note: e.details.note ?? "",
                  }))}
                  columns={[
                    ["date", "Date"],
                    ["actor", "Human actor"],
                    ["action", "Event"],
                    ["title", "Case"],
                    ["status", "Status"],
                    ["note", "Decision / response"],
                  ]}
                />
              </>
            )}
          </>
        )
      )}
    </main>
  );
}
