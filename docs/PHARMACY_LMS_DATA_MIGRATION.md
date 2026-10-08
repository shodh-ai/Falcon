# Pharmacy LMS data migration

## Purpose

This runbook prepares the official Pharmacy LMS source files for reconciliation without changing Falcon production data. The preparation command is deliberately fail-closed: it creates privacy-minimized staging records and a readiness report, but it never imports records.

## Source package

Required inputs:

- Approved university academic calendar PDF.
- Pharmacy subject catalogue DOCX.
- Pharmacy faculty-allocation XLSX.
- Pharmacy student-admissions XLS/XLSX.

Required before production import:

- HR master extract keyed by employee ID and official email.
- Official student-account mapping keyed by enrollment number, containing official email, current curricular term, curriculum scheme ID, cohort ID and section ID.
- Canonical programmes, schemes, cohorts, terms, sections and offering dates.
- Continuing-student rosters for every programme and active term.
- Current-provider LMS history, file manifest, hashes, reconciliation totals, freeze timestamp and final delta.
- Corrected or formally approved 2026-27 calendar title.

Never copy the source student password column into a migration package, log, report or database.

## Prepare a review package

Install the parser dependencies from `backend/scripts/department-import/requirements.txt`, then run:

```bash
cd backend
python3 scripts/pharmacy-migration/prepare-pharmacy-migration.py \
  --calendar "/path/to/Academic Calendar_Final_25 May 2026.pdf" \
  --subjects "/path/to/Subject.docx" \
  --faculty "/path/to/Faculty list.xlsx" \
  --students "/path/to/2026 Students.xls" \
  --out data/departments/pharmacy/staging
```

When approved HR and account files are available, add:

```text
--hr-master /path/to/pharmacy-hr-master.xlsx
--student-accounts /path/to/pharmacy-student-accounts.xlsx
--approval-checklist /path/to/approved-migration-checklist.json
```

Start from `backend/data/departments/pharmacy/migration-approvals.template.json`. Each `true` value must be backed by an approval or test artifact; the tool does not infer approval from the presence of a file.

The source files can use either legacy XLS or OOXML content. The parser detects the workbook container instead of trusting the filename extension.

## Generated review outputs

The ignored `data/departments/pharmacy/staging/` directory contains:

- `source-manifest.csv`: source sizes and SHA-256 hashes.
- `calendar-days.csv`: one day-classification record per date.
- `calendar-source-blocks.csv`: extracted text requiring event and applicability review.
- `course-catalog-staging.csv`: normalized canonical course candidates.
- `faculty-roster-staging.csv`: HR reconciliation status per faculty identity.
- `faculty-allocations-staging.csv`: deduplicated allocations and shared-teaching review status.
- `students-staging.csv`: admitted students only, without source passwords or personal login identities.
- `student-contact-reconciliation.csv`: isolated personal contact emails for correction/reconciliation only.
- `student-exclusions.csv`: rejected or ineligible source rows with an auditable reason.
- `provisional-seed-conflicts.csv`: official-data conflicts with the provisional Pharmacy seed.
- `source-issues.csv`: invalid emails, duplicate allocations, shared allocations and calendar issues.
- `readiness.json`: machine-readable production gate.
- `README.md`: human-readable staging summary.

Staging output is intentionally Git-ignored because it contains confidential identity data.

## Current supplied-package result

The 22 September 2026 review run produced:

- 365 calendar dates covering 1 July 2026 through 30 June 2027.
- 64 canonical course candidates.
- 24 unique faculty identities.
- 67 allocations after removing one exact duplicate from the 68 source rows.
- 151 provisionally eligible students and one excluded admission row.
- Zero exported password fields and zero copied source password values.
- 30 provisional-seed conflicts requiring an approved supersession map.

This result is not production-ready. The machine-readable gate remains false until the approval checklist, HR/account reconciliation, programme structure, continuing rosters, LMS history, allocation corrections and acceptance evidence are complete.

## Production gate

The Pharmacy department configuration points to `staging/readiness.json`. A real department import now fails unless that report explicitly contains:

```json
{
  "ready_for_production_import": true,
  "blockers": []
}
```

Dry-run validation remains available while blockers exist. Missing gates, unresolved blockers and changed inputs stop a production import before any database write.

The readiness report must only be approved after:

1. Every source SHA-256 hash is frozen.
2. All 24 faculty identities resolve against active HR records using employee ID, official email, department and employment status.
3. Every eligible student has an official account, programme, scheme, cohort, term and section.
4. Shared-teaching roles and the duplicate allocation are resolved.
5. Existing provisional Pharmacy courses and allocations have an approved supersession map.
6. The corrected calendar and reviewed multi-event records are approved.
7. Continuing rosters and current LMS history reconcile to provider totals.
8. Dry-run, security and cross-department acceptance tests pass.

## Calendar model

`academic_calendar_days` stores one classification for each university date. `admin_academic_calendar_events` stores any number of events on that date with academic year, applicability scope, coordinator, category, source reference and SHA-256 hash.

The student/faculty calendar reads the canonical multi-event store. `campus_master_calendar` remains a blocked-date projection rather than the event authority.

## Superseding provisional Pharmacy data

Do not overwrite or delete the existing seed. Produce an approved mapping from each provisional course/allocation to its official replacement, close the provisional record through audited history, and activate only the reconciled official offering. The import must not leave conflicting provisional and official allocations active at the same time.

## Verification commands

```bash
cd backend
npm run test:pharmacy-migration
npm run test:department-import-gate
npm run build
```

After the migration is applied to a non-production database, run the full LMS regression suite and verify course, faculty, enrollment, calendar, tenant and department isolation before enabling the Pharmacy LMS pilot cohort.
