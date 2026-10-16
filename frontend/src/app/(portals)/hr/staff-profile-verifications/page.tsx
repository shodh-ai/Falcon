"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Row = {
  review_id: string | null;
  user_id: string;
  name: string;
  official_email: string;
  role_name: string;
  dept_id: number;
  dept_name: string;
  status: string;
  onboarding_status: string;
  source: string;
};
type Detail = {
  review: Omit<Row, "review_id"> & {
    review_id: string;
    return_reason: string | null;
  };
  profile: Record<string, unknown>;
  documents: Array<{ doc_type: string; file_path: string; status: string }>;
  events: Array<{
    event_type: string;
    occurred_at: string;
    reason: string | null;
  }>;
  email_delivery?: { status: string; sent_at: string | null } | null;
};
const FIELDS: Record<string, string> = {
  staff_mobile: "Mobile number",
  gender: "Gender",
  date_of_birth: "Date of birth",
  blood_group: "Blood group",
  pan_number: "PAN number",
  aadhaar_number: "Aadhaar number",
  bank_account_no: "Bank account number",
  ifsc_code: "IFSC code",
  pf_uan: "PF UAN",
  permanent_address: "Permanent address",
  current_address: "Current address",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_phone: "Emergency contact phone",
  degree_level: "Degree level",
  degree_name: "Degree name",
  university: "University",
  passing_year: "Passing year",
  specialization: "Specialization",
  total_experience_years: "Teaching experience (years)",
  industry_experience_years: "Industry experience (years)",
  orcid_id: "ORCID ID",
  scopus_id: "Scopus ID",
  google_scholar_url: "Google Scholar URL",
};
const DOCS: Record<string, string> = {
  PHOTO: "Passport photograph",
  AADHAAR: "Aadhaar card",
  PAN: "PAN card",
  HIGHEST_DEGREE: "Highest degree certificate",
};
const STATUS: Record<string, string> = {
  PENDING_HR: "Awaiting HR review",
  RETURNED_FOR_CORRECTION: "Corrections requested",
  APPROVED: "Approved",
  AWAITING_SUBMISSION: "Awaiting submission",
};

export default function StaffProfileVerificationsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canDecide = [...(user?.roles ?? []), user?.role ?? ""].includes(
    "HRAdmin",
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("PENDING_HR");
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewDoc, setPreviewDoc] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    image: boolean;
  } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const load = useCallback(() => api.get<Row[]>("/api/hr/staff-profile-reviews")
    .then((data) => { setRows(data); setError(""); })
    .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load staff profiles. Please retry."))
    .finally(() => setLoading(false)), [api]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selected || !previewDoc) return;
    let disposed = false;
    let objectUrl: string | undefined;
    void api
      .getBlob(
        `/api/staff/verifications/${selected.review.user_id}/documents/${previewDoc}/preview`,
      )
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, image: blob.type.startsWith("image/") });
      })
      .catch(() => {
        if (!disposed)
          setPreviewError(
            "Could not open this document. Please refresh and try again.",
          );
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, selected, previewDoc]);
  const departments = useMemo(
    () =>
      [
        ...new Map(
          rows.map((row) => [String(row.dept_id), row.dept_name]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [rows],
  );
  const visible = rows.filter(
    (row) =>
      (!department || String(row.dept_id) === department) &&
      (!status || row.status === status) &&
      `${row.name} ${row.official_email}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const open = async (row: Row) => {
    if (!row.review_id) return;
    setBusy(true);
    try {
      const detail = await api.get<Detail>(
        `/api/hr/staff-profile-reviews/${row.review_id}`,
      );
      setPreview(null);
      setPreviewError("");
      setSelected(detail);
      setPreviewDoc(detail.documents[0]?.doc_type ?? "");
      setReason("");
      setFields([]);
      setDocuments([]);
      setError("");
      setMessage("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open this profile.",
      );
    } finally {
      setBusy(false);
    }
  };
  const decide = async (action: "approve" | "return") => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(
        `/api/hr/staff-profile-reviews/${selected.review.review_id}/${action}`,
        action === "return"
          ? { reason: reason.trim(), fields, documents }
          : undefined,
      );
      setMessage(
        action === "approve"
          ? `${selected.review.name}’s profile is approved.`
          : `Corrections requested from ${selected.review.name}. An email has been queued to ${selected.review.official_email}.`,
      );
      setSelected(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this decision. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  const toggle = (
    current: string[],
    set: (value: string[]) => void,
    item: string,
  ) =>
    set(
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item],
    );
  const qualification = selected?.profile.qualification as
    | Record<string, unknown>
    | undefined;
  const values = { ...selected?.profile, ...qualification };
  const reviewing = canDecide && selected?.review.status === "PENDING_HR";

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff profile verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review each person’s details and documents. Approve the profile or
            ask for corrections by email.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          Refresh
        </Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {["PENDING_HR", "RETURNED_FOR_CORRECTION", "APPROVED"].map((key) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-xl border p-4 text-left ${status === key ? "border-blue-700 bg-blue-50" : "bg-white"}`}
          >
            <p className="text-sm text-muted-foreground">{STATUS[key]}</p>
            <p className="mt-1 text-2xl font-semibold">
              {
                rows.filter(
                  (row) =>
                    row.status === key &&
                    (!department || String(row.dept_id) === department),
                ).length
              }
            </p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search staff"
          className="min-w-52 flex-1"
          placeholder="Search by name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Department"
          className="rounded-lg border bg-white p-2 text-sm"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          <option value="">All departments</option>
          {departments.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Review status"
          className="rounded-lg border bg-white p-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </div>
      {message && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-muted-foreground">
            <tr>
              {["Name", "Role", "Department", "Status", "Action"].map(
                (title) => (
                  <th key={title} className="px-4 py-3 font-medium">
                    {title}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.review_id ?? row.user_id} className="border-t">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.official_email}
                  </p>
                </td>
                <td className="px-4 py-3">{row.role_name}</td>
                <td className="px-4 py-3">{row.dept_name}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">
                    {STATUS[row.status] ?? row.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {row.review_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void open(row)}
                    >
                      {row.status === "PENDING_HR" && canDecide
                        ? "Review"
                        : "View"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Profile not submitted yet
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading staff profiles…"
              : "No staff profiles match these filters."}
          </p>
        )}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setSelected(null);
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{selected?.review.name}</DialogTitle>
            <DialogDescription>
              {selected?.review.official_email} · {selected?.review.role_name} ·{" "}
              {selected?.review.dept_name}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <Badge variant="outline" className="w-fit">
                {STATUS[selected.review.status] ?? selected.review.status}
              </Badge>
              {selected.review.return_reason && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm">
                  <strong>HR feedback</strong>
                  <p className="whitespace-pre-wrap">
                    {selected.review.return_reason}
                  </p>
                  {selected.email_delivery && (
                    <p className="mt-2 text-xs">
                      Correction email:{" "}
                      {selected.email_delivery.status === "SENT"
                        ? "Sent"
                        : selected.email_delivery.status === "RETRY"
                          ? "Delivery delayed — retry scheduled"
                          : "Queued for delivery"}
                    </p>
                  )}
                </div>
              )}
              <div className="grid gap-5 lg:grid-cols-2">
                <section aria-label="Submitted profile" className="space-y-3">
                  <h2 className="font-semibold">Submitted details</h2>
                  {reviewing && (
                    <p className="text-xs text-muted-foreground">
                      If something needs changing, tick the field or document
                      and add a note below.
                    </p>
                  )}
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(FIELDS).map(([key, title]) => (
                      <div key={key} className="rounded-lg border p-3 text-sm">
                        <dt className="font-medium">
                          {reviewing && (
                            <input
                              className="mr-2"
                              aria-label={`Request correction: ${title}`}
                              type="checkbox"
                              checked={fields.includes(key)}
                              onChange={() => toggle(fields, setFields, key)}
                            />
                          )}
                          {title}
                        </dt>
                        <dd className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">
                          {values[key] == null || values[key] === ""
                            ? "Not provided"
                            : String(values[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <h2 className="pt-2 font-semibold">Documents</h2>
                  {Object.entries(DOCS).map(([key, title]) => {
                    const doc = selected.documents.find(
                      (document) => document.doc_type === key,
                    );
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                      >
                        <label>
                          {reviewing && (
                            <input
                              className="mr-2"
                              aria-label={`Request replacement: ${title}`}
                              type="checkbox"
                              checked={documents.includes(key)}
                              onChange={() =>
                                toggle(documents, setDocuments, key)
                              }
                            />
                          )}
                          {title}
                          {!doc && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              Not uploaded
                            </span>
                          )}
                        </label>
                        {doc && (
                          <Button
                            size="sm"
                            variant={previewDoc === key ? "default" : "outline"}
                            onClick={() => {
                              if (previewDoc !== key) {
                                setPreview(null);
                                setPreviewError("");
                                setPreviewDoc(key);
                              }
                            }}
                          >
                            View {title}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </section>
                <section
                  aria-label="Document preview"
                  className="h-fit rounded-lg border bg-slate-50 p-3 lg:sticky lg:top-0"
                >
                  <h2 className="mb-3 font-semibold">
                    {DOCS[previewDoc] ?? "Document preview"}
                  </h2>
                  {previewError ? (
                    <p role="alert" className="p-4 text-sm text-red-700">
                      {previewError}
                    </p>
                  ) : preview ? (
                    preview.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview.url}
                        alt={DOCS[previewDoc] ?? "Submitted document"}
                        className="max-h-[520px] w-full object-contain"
                      />
                    ) : (
                      <iframe
                        title="Submitted document preview"
                        src={preview.url}
                        className="h-[520px] w-full rounded border bg-white"
                      />
                    )
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">
                      {previewDoc
                        ? "Loading document…"
                        : "Select a document to view it here."}
                    </p>
                  )}
                </section>
              </div>
              {reviewing && (
                <label className="block space-y-2 text-sm font-medium">
                  Correction note
                  <textarea
                    className="mt-2 block min-h-24 w-full rounded-lg border p-3 font-normal"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Explain what needs to be corrected. This note will be emailed to the faculty member."
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    {fields.length + documents.length} correction(s) selected.
                    Approval does not require a note.
                  </span>
                </label>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <DialogFooter className="sticky -bottom-6 border-t bg-background py-4 sm:justify-between">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Close profile
                </Button>
                {reviewing && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (!fields.length && !documents.length)
                      }
                      onClick={() => void decide("return")}
                    >
                      Request corrections &amp; email
                    </Button>
                    <Button
                      disabled={
                        busy || fields.length > 0 || documents.length > 0
                      }
                      onClick={() => void decide("approve")}
                    >
                      Approve profile
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
