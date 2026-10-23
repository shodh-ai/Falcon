'use client';

import type { RndApplication } from '@/lib/api/api.academic-rnd';
import { FacultyResearchDocuments } from './FacultyResearchDocuments';

function formatBudget(value: RndApplication['requested_budget']) {
  if (value == null || String(value).trim() === '') return 'Not provided';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 'Budget unavailable';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

function formatSubmission(value: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return 'Submission date unavailable';
  return `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(date)} IST`;
}

export function FacultyResearchGrantDetails({ application }: { application: RndApplication }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Requested budget</dt><dd className="font-medium">{formatBudget(application.requested_budget)}</dd></div>
        <div><dt className="text-muted-foreground">Grant programme</dt><dd>{application.config_title?.trim() || 'Not provided'}</dd></div>
        <div><dt className="text-muted-foreground">Submitted</dt><dd>{formatSubmission(application.submitted_at)}</dd></div>
        <div><dt className="text-muted-foreground">Application ID</dt><dd className="break-all font-mono text-xs">{application.application_id}</dd></div>
      </dl>
      <FacultyResearchDocuments documents={application.documents} documentScope={application.application_id} />
    </div>
  );
}
