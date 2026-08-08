'use client';

import { useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  UNIVERSITY_POLICIES,
  type UniversityPolicy,
} from '@/lib/student/university-policies-data';

type EssentialPolicy = {
  id: string;
  title: string;
  description: string;
  lastUpdated: string;
};

/** Eight policies every student needs — keep this list short on purpose. */
const ESSENTIAL_POLICIES: EssentialPolicy[] = [
  {
    id: 'pol-attendance',
    title: 'Attendance Policy',
    description: 'Minimum class attendance required to sit for exams.',
    lastUpdated: '2026-06-15',
  },
  {
    id: 'pol-exam-rules',
    title: 'Examination Rules',
    description: 'What to carry, what is allowed, and how exams are conducted.',
    lastUpdated: '2026-05-05',
  },
  {
    id: 'pol-fee-payment',
    title: 'Fee Policy',
    description: 'When fees are due and what happens if payment is delayed.',
    lastUpdated: '2026-07-10',
  },
  {
    id: 'pol-anti-ragging',
    title: 'Anti-Ragging Policy',
    description: 'Zero tolerance for ragging — how to report and get help.',
    lastUpdated: '2026-07-05',
  },
  {
    id: 'pol-code-of-conduct',
    title: 'Student Code of Conduct',
    description: 'Expected behaviour on campus and in university activities.',
    lastUpdated: '2026-06-12',
  },
  {
    id: 'pol-library',
    title: 'Library Rules',
    description: 'Borrowing books, overdue fines, and library etiquette.',
    lastUpdated: '2026-04-18',
  },
  {
    id: 'pol-hostel',
    title: 'Hostel Rules',
    description: 'Timings, visitors, mess rules, and resident responsibilities.',
    lastUpdated: '2026-06-25',
  },
  {
    id: 'pol-wifi',
    title: 'IT & Wi-Fi Policy',
    description: 'Campus Wi-Fi use, account security, and fair usage rules.',
    lastUpdated: '2026-04-30',
  },
];

function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function resolveFullPolicy(essential: EssentialPolicy): UniversityPolicy {
  const found = UNIVERSITY_POLICIES.find((p) => p.id === essential.id);
  if (found) {
    return {
      ...found,
      name: essential.title,
      shortDescription: essential.description,
      lastUpdated: essential.lastUpdated,
    };
  }
  return {
    id: essential.id,
    name: essential.title,
    shortDescription: essential.description,
    category: 'academic',
    version: '1.0',
    lastUpdated: essential.lastUpdated,
    publishedAt: essential.lastUpdated,
    status: 'Active',
    mandatory: true,
    summary: essential.description,
    sections: [
      {
        heading: 'Overview',
        bullets: [essential.description],
      },
    ],
    appliesTo: 'All students',
    authority: 'University Administration',
  };
}

export function UniversityPoliciesWorkspace() {
  const [selected, setSelected] = useState<EssentialPolicy | null>(null);
  const selectedFull = selected ? resolveFullPolicy(selected) : null;

  return (
    <>
      <StudentPageHeader
        title="University Policies"
        description="Quick reference summaries for common campus rules. Official acknowledgements and signed policies appear under Essentials when published by the university."
        eyebrow="Student Portal"
      />

      <div
        role="note"
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <span className="font-semibold">Reference only.</span> These cards are orientation guides,
        not the university&apos;s signed policy register. Use published policies for acknowledgements
        and compliance.
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {ESSENTIAL_POLICIES.map((policy) => (
          <article
            key={policy.id}
            className="flex flex-col rounded-2xl border border-sgvu-navy/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:shadow-md"
          >
            <div className="mb-1 h-1 w-10 rounded-full bg-sgvu-gold" />
            <h2 className="mt-3 text-lg font-bold text-sgvu-navy">{policy.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {policy.description}
            </p>
            <div className="mt-5">
              <Button
                size="sm"
                className="bg-sgvu-navy text-white hover:bg-[#123A6D]"
                onClick={() => setSelected(policy)}
              >
                Read More
              </Button>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {selected && selectedFull ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-sgvu-navy">{selected.title}</DialogTitle>
                <DialogDescription>
                  Last updated {formatDate(selected.lastUpdated)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <p className="leading-relaxed text-foreground/90">{selectedFull.summary}</p>
                {selectedFull.sections.map((section) => (
                  <div key={section.heading}>
                    <h4 className="font-semibold text-sgvu-navy">{section.heading}</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button
                  className="bg-sgvu-navy text-white hover:bg-[#123A6D]"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
