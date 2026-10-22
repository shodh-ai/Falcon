"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StaffDocumentPreview } from "@/components/onboarding/StaffDocumentPreview";
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
  revision: number;
  document_review_status?: string;
  documents_deferred?: boolean;
  recovery_required?: boolean;
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
  DOCUMENTS_PENDING: "Documents pending",
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
  const [reviewMode, setReviewMode] = useState<"CHECK" | "CORRECT">("CHECK");
  const [reviewedFields, setReviewedFields] = useState<string[]>([]);
  const [reviewedDocs, setReviewedDocs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewDoc, setPreviewDoc] = useState("");
  const [correctionPrepared, setCorrectionPrepared] = useState(false);
  const load = useCallback(() => api.get<Row[]>("/api/hr/staff-profile-reviews")
    .then((data) => { setRows(data); setError(""); })
    .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load staff profiles. Please retry."))
    .finally(() => setLoading(false)), [api]);
  useEffect(() => {
    void load();
  }, [load]);
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
      (!status || (status === "DOCUMENTS_PENDING"
        ? row.status === "APPROVED" && row.document_review_status === "PENDING"
        : row.status === status)) &&
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
      setSelected(detail);
      setPreviewDoc(detail.documents[0]?.doc_type ?? "");
      setReason("");
      setFields([]);
      setDocuments([]);
      setReviewMode("CHECK");
      setReviewedFields([]);
      setReviewedDocs([]);
      setError("");
      setMessage("");
      setCorrectionPrepared(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open this profile.",
      );
    } finally {
      setBusy(false);
    }
  };
  const decide = async (action: "approve" | "return" | "verify-documents") => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api.post<{ status?: string; email_status?: string }>(
        `/api/hr/staff-profile-reviews/${selected.review.review_id}/${action}`,
        action === "return"
          ? { reason: reason.trim(), fields, documents, revision: selected.review.revision }
          : action === "verify-documents"
            ? { reviewed_documents: reviewedDocs }
            : selected.review.recovery_required
              ? { defer_documents: false, reviewed_fields: reviewedFields, reviewed_documents: reviewedDocs, revision: selected.review.revision }
            : { defer_documents: true, reviewed_fields: reviewedFields,
                deferral_reason: "HR approved profile details; document verification deferred until original files are available for inspection." },
      );
      if (action === "return" && result.status !== "RETURNED_FOR_CORRECTION") {
        throw new Error("The correction request was not confirmed. Refresh the profile and retry.");
      }
      if (action === "return") {
        setRows((current) => current.map((row) => row.review_id === selected.review.review_id
          ? { ...row, status: "RETURNED_FOR_CORRECTION", revision: row.revision + 1 } : row));
        setStatus("RETURNED_FOR_CORRECTION");
      }
      setMessage(
        action === "approve"
          ? selected.review.recovery_required
            ? `${selected.review.name}’s profile and documents are approved. Account access is restored.`
            : `${selected.review.name}’s profile details are approved and account access is restored. Document verification remains pending.`
          : action === "verify-documents"
            ? `${selected.review.name}’s documents are verified. The earlier profile approval is unchanged.`
            : `Corrections requested from ${selected.review.name}. The profile is now in Corrections requested. A notification and correction email have been queued for ${selected.review.official_email}; queued does not mean delivered.`,
      );
      setSelected(null);
      window.dispatchEvent(new CustomEvent("falcon:notifications-refresh"));
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
  const documentReview = canDecide && selected?.review.status === "APPROVED" && selected.review.document_review_status === "PENDING";
  const correcting = reviewing && reviewMode === "CORRECT";
  const recoveryReview = reviewing && selected?.review.recovery_required && !correcting;
  const inspectingDocs = documentReview || recoveryReview;
  const changeMode = (mode: "CHECK" | "CORRECT") => {
    if (mode === reviewMode) return;
    if (mode === "CORRECT" && !correctionPrepared) {
      // Only infer gaps after HR actually started a checklist. Untouched
      // profiles must never turn into a request to correct every field.
      setFields(reviewedFields.length ? Object.keys(FIELDS).filter((key) => !reviewedFields.includes(key)) : []);
      setDocuments(reviewedDocs.length ? Object.keys(DOCS).filter((key) => !reviewedDocs.includes(key)) : []);
      setCorrectionPrepared(true);
    }
    setReviewMode(mode);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff profile verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve each person’s profile details or request corrections. Documents can be verified separately later.
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
      <div className="grid gap-3 sm:grid-cols-4">
        {["PENDING_HR", "RETURNED_FOR_CORRECTION", "APPROVED", "DOCUMENTS_PENDING"].map((key) => (
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
                    (key === "DOCUMENTS_PENDING" ? row.status === "APPROVED" && row.document_review_status === "PENDING" : row.status === key) &&
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
                  {row.document_review_status === "PENDING" && <p className="mt-1 text-xs text-amber-800">Documents not yet verified</p>}
                </td>
                <td className="px-4 py-3">
                  {row.review_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void open(row)}
                    >
                      {row.document_review_status === "PENDING" && canDecide ? "Review documents" : row.status === "PENDING_HR" && canDecide
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
              {reviewing && (
                <div className="space-y-3 rounded-lg border bg-blue-50 p-3 text-sm">
                  <p>{selected.review.recovery_required ? "Recovery submission: inspect the saved details and all four documents before approval. Documents cannot be deferred for this recovery review." : "Profile details and documents are separate decisions. Approving details restores account access; documents stay pending and are not marked verified."}</p>
                  <div role="group" aria-label="Review action" className="flex flex-wrap gap-2">
                    <Button disabled={busy} size="sm" variant={reviewMode === "CHECK" ? "default" : "outline"} aria-pressed={reviewMode === "CHECK"} onClick={() => changeMode("CHECK")}>Review for approval</Button>
                    <Button disabled={busy} size="sm" variant={reviewMode === "CORRECT" ? "default" : "outline"} aria-pressed={reviewMode === "CORRECT"} onClick={() => changeMode("CORRECT")}>Request corrections</Button>
                  </div>
                  {correcting && <p role="status">Correction draft — not sent yet. Unchecked checklist items were carried over where a review had started. Confirm the targets, write a correction note, then click Send correction request &amp; email below.</p>}
                </div>
              )}
              {selected.review.document_review_status === "PENDING" && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Profile details approved. Documents are still pending verification; teaching access is not frozen by this document follow-up.</p>
              )}
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
                      {correcting ? "Select only fields or documents that need correction, then add a note." : "Tick details you have reviewed and found correct. Select all is available after reviewing this profile."}
                    </p>
                  )}
                  {reviewing && <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => correcting ? setFields(Object.keys(FIELDS)) : setReviewedFields(Object.keys(FIELDS))}>{correcting ? "Select all correction fields" : "Select all details"}</Button>
                    <Button size="sm" variant="outline" onClick={() => correcting ? setFields([]) : setReviewedFields([])}>Clear all details</Button>
                  </div>}
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(FIELDS).map(([key, title]) => (
                      <div key={key} className="rounded-lg border p-3 text-sm">
                        <dt className="font-medium">
                          {reviewing && (
                            <input
                              className="mr-2"
                              aria-label={`${correcting ? "Request correction" : "Reviewed and correct"}: ${title}`}
                              type="checkbox"
                              checked={(correcting ? fields : reviewedFields).includes(key)}
                              onChange={() => correcting ? toggle(fields, setFields, key) : toggle(reviewedFields, setReviewedFields, key)}
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
                  {reviewing && !correcting && !recoveryReview && <p className="text-xs text-amber-800">No document checkboxes are required for details-only approval. These documents will remain pending.</p>}
                  {(correcting || inspectingDocs) && <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => inspectingDocs ? setReviewedDocs(Object.keys(DOCS)) : setDocuments(Object.keys(DOCS))}>{inspectingDocs ? "Select all inspected documents" : "Select all replacement requests"}</Button>
                    <Button size="sm" variant="outline" onClick={() => inspectingDocs ? setReviewedDocs([]) : setDocuments([])}>Clear all documents</Button>
                  </div>}
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
                          {(correcting || inspectingDocs) && (
                            <input
                              className="mr-2"
                              aria-label={`${inspectingDocs ? "Inspected document" : "Request replacement"}: ${title}`}
                              type="checkbox"
                              checked={(inspectingDocs ? reviewedDocs : documents).includes(key)}
                              onChange={() =>
                                inspectingDocs ? toggle(reviewedDocs, setReviewedDocs, key) : toggle(documents, setDocuments, key)
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
                              setPreviewDoc(key);
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
                  {previewDoc ? (
                    <StaffDocumentPreview
                      key={`${selected.review.user_id}:${previewDoc}`}
                      userId={selected.review.user_id}
                      docType={previewDoc}
                      title={DOCS[previewDoc] ?? "Submitted document"}
                    />
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">
                      Select a document to view it here.
                    </p>
                  )}
                </section>
              </div>
              {correcting && (
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
                    Checked items here mean corrections are required, not approved.
                  </span>
                </label>
              )}
              {reviewing && !correcting && <p className="text-sm text-muted-foreground">{reviewedFields.length} of {Object.keys(FIELDS).length} details checked. {recoveryReview ? `${reviewedDocs.length} of ${Object.keys(DOCS).length} documents inspected.` : "Documents will remain pending."}</p>}
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
                    {correcting ? (
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (!fields.length && !documents.length)
                      }
                      onClick={() => void decide("return")}
                    >
                      {busy ? "Sending correction request…" : "Send correction request & email"}
                    </Button>
                    ) : (
                    <Button
                      disabled={
                        busy || reviewedFields.length !== Object.keys(FIELDS).length || Boolean(recoveryReview && reviewedDocs.length !== Object.keys(DOCS).length)
                      }
                      onClick={() => void decide("approve")}
                    >
                      {recoveryReview ? "Approve profile and documents" : "Approve details — documents pending"}
                    </Button>
                    )}
                  </div>
                )}
                {documentReview && <Button disabled={busy || reviewedDocs.length !== Object.keys(DOCS).length} onClick={() => void decide("verify-documents")}>Verify inspected documents</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
