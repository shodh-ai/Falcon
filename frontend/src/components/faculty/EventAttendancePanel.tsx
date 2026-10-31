"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/notifications/falcon-toast";
type Cohort = {
  cohort_id: string;
  event_title: string;
  course_code: string;
  class_date: string;
  faculty_name: string;
  coordinator_name: string;
  coordinator_user_id: string;
  status: string;
  revision: number;
  created_at: string;
  event_approved: boolean;
  reason: string;
  student_ids: string[];
  attendance_data?: { student_id: string; status: string }[];
  attendance_marked_at?: string;
};
type Event = {
  event_id: string;
  title: string;
  event_date: string;
  coordinator_name: string;
};
type Slot = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  start_time: string;
  end_time: string;
  cancelled?: boolean;
  has_saved_attendance?: boolean;
};
type Student = { student_id: string; name: string; roll_number: string };
export function EventAttendancePanel({ hod = false }: { hod?: boolean }) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [rows, setRows] = useState<Cohort[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [slots, setSlots] = useState<Slot[]>([]);
  const [date, setDate] = useState(""),
    [event, setEvent] = useState(""),
    [session, setSession] = useState(""),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Cohort | null>(null);
  const [students, setStudents] = useState<Student[]>([]),
    [marks, setMarks] = useState<Record<string, string>>({}),
    [decisions, setDecisions] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      setRows(
        await api.get<Cohort[]>(
          `/api/academics/${hod ? "hod" : "faculty"}/event-classes`,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load event classes");
    }
  }, [api, hod]);
  useEffect(() => {
    void load();
    if (!hod)
      api
        .get<Event[]>("/api/academics/faculty/event-classes/events")
        .then(setEvents)
        .catch((e) => setError(e.message));
  }, [load, api, hod]);
  useEffect(() => {
    let active = true;
    setSlots([]);
    setSession("");
    if (date && !hod)
      api
        .get<Slot[]>(`/api/academics/faculty/timetable/today?date=${date}`)
        .then((data) => {
          if (active)
            setSlots(
              data.filter(
                (s) =>
                  !s.cancelled &&
                  !s.has_saved_attendance &&
                  !s.timetable_id.includes(":"),
              ),
            );
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [api, date, hod]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
      toast.success("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  async function open(row: Cohort) {
    setSelected(null);
    setStudents([]);
    setBusy(true);
    try {
      const data = await api.get<Student[]>(
        `/api/academics/faculty/event-classes/${row.cohort_id}/roster`,
      );
      setStudents(data);
      setMarks(
        Object.fromEntries(
          data.map((s) => [
            s.student_id,
            row.attendance_data?.find((x) => x.student_id === s.student_id)
              ?.status || "",
          ]),
        ),
      );
      setSelected(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load roster");
    } finally {
      setBusy(false);
    }
  }
  const selectClass = "w-full rounded-lg border bg-white p-3 text-sm";
  return (
    <main className="space-y-5 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">
        {hod ? "Event class approvals" : "Mark Event Attendance"}
      </h1>
      <p className="max-w-3xl text-sm text-slate-600">
        Only an approved event and an HOD-approved class cohort exempt the
        class. Its workload remains counted. The event’s faculty coordinator
        records each student’s actual attendance; nobody is marked present
        automatically.
      </p>
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">
          {error}
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      )}
      {!hod && (
        <form
          className="space-y-3 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const slot = slots.find((s) => s.timetable_id === session);
            if (!slot) return;
            void act(() =>
              api.post(
                "/api/academics/faculty/event-classes",
                {
                  event_id: event,
                  course_id: slot.course_id,
                  timetable_id: session,
                  date,
                  reason,
                },
                { "Idempotency-Key": crypto.randomUUID() },
              ),
            );
          }}
        >
          <h2 className="font-semibold">
            Request a class exemption for an event
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Approved event
              <select
                required
                aria-label="Approved event"
                className={selectClass}
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              >
                <option value="">Select event</option>
                {events.map((e) => (
                  <option key={e.event_id} value={e.event_id}>
                    {e.title} ·{" "}
                    {new Date(e.event_date).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    · {e.coordinator_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Class date
              <Input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            Your class
            <select
              required
              className={selectClass}
              value={session}
              onChange={(e) => setSession(e.target.value)}
            >
              <option value="">Select scheduled class</option>
              {slots.map((s) => (
                <option key={s.timetable_id} value={s.timetable_id}>
                  {s.course_code} · {s.start_time}–{s.end_time}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            The entire verified class roster is submitted for HOD approval.
            Changes to the class or students require a fresh request. Moved,
            substituted and already marked sessions are not eligible.
          </p>
          <Input
            required
            minLength={10}
            maxLength={2000}
            placeholder="Reason for exempting this class"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button disabled={busy || !session || !event}>
            Send cohort for HOD approval
          </Button>
        </form>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">
          {hod ? "Cohort requests" : "Your event classes"}
        </h2>
        {!rows.length && (
          <p className="text-sm text-slate-500">No event class requests.</p>
        )}
        {rows.map((r) => (
          <article
            key={r.cohort_id}
            className={`rounded-xl border p-4 ${r.status === "APPROVED" && r.event_approved ? "bg-emerald-50" : r.status === "REJECTED" ? "bg-rose-50" : "bg-amber-50"}`}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                {r.course_code} · {r.event_title}
              </strong>
              <span className="text-sm">
                {r.status}
                {!r.event_approved ? " · event approval no longer active" : ""}
              </span>
            </div>
            <p className="text-sm">
              {r.class_date} · {r.student_ids.length} students · Faculty:{" "}
              {r.faculty_name} · Coordinator: {r.coordinator_name}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Raised on{" "}
              {new Date(r.created_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </p>
            <p className="my-2 text-sm">{r.reason}</p>
            {hod && r.status === "PENDING" && (
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label={`Decision reason ${r.course_code}`}
                  placeholder="Decision reason"
                  value={decisions[r.cohort_id] || ""}
                  onChange={(e) =>
                    setDecisions({
                      ...decisions,
                      [r.cohort_id]: e.target.value,
                    })
                  }
                />
                {["APPROVE", "REJECT"].map((action) => (
                  <Button
                    key={action}
                    variant={action === "APPROVE" ? "default" : "outline"}
                    disabled={busy || !decisions[r.cohort_id]?.trim()}
                    onClick={() =>
                      void act(() =>
                        api.post(
                          `/api/academics/hod/event-classes/${r.cohort_id}/decision`,
                          { action, reason: decisions[r.cohort_id] },
                          { "If-Match": String(r.revision) },
                        ),
                      )
                    }
                  >
                    {action === "APPROVE" ? "Approve cohort" : "Reject"}
                  </Button>
                ))}
              </div>
            )}
            {!hod &&
              r.coordinator_user_id === user?.user_id &&
              r.status === "APPROVED" &&
              r.event_approved && (
                <Button disabled={busy} onClick={() => void open(r)}>
                  {r.attendance_marked_at
                    ? "View / correct event attendance"
                    : "Mark event attendance"}
                </Button>
              )}
          </article>
        ))}
      </section>
      {selected && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">
            {selected.course_code} · {selected.event_title} — {students.length}{" "}
            students
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Mark every student. Saves update the course attendance report and
            keep an audit history.
          </p>
          {students.map((s) => (
            <div
              key={s.student_id}
              className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <span>
                {s.name} <small>{s.roll_number}</small>
              </span>
              <select
                aria-label={`Attendance for ${s.name}`}
                className="rounded border p-2"
                value={marks[s.student_id] || ""}
                onChange={(e) =>
                  setMarks({ ...marks, [s.student_id]: e.target.value })
                }
              >
                <option value="">Not marked</option>
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
              </select>
            </div>
          ))}
          <Button
            className="mt-4"
            disabled={
              busy ||
              !students.length ||
              students.some((s) => !marks[s.student_id])
            }
            onClick={() =>
              void act(async () => {
                await api.post(
                  `/api/academics/faculty/event-classes/${selected.cohort_id}/attendance`,
                  {
                    attendance_data: students.map((s) => ({
                      student_id: s.student_id,
                      status: marks[s.student_id],
                    })),
                  },
                  { "If-Match": String(selected.revision) },
                );
                setSelected(null);
              })
            }
          >
            Save event attendance
          </Button>
        </section>
      )}
    </main>
  );
}
