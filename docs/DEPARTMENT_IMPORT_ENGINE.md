# Department Data Migration Engine

Reusable pipeline for importing official department workload and student allocation data into Falcon Campus OS.

## Supported departments

| Slug | Department | Source PDFs |
|------|------------|-------------|
| `mechanical` | Mech Engg | Student template + ME/Agri workload PDF |
| `agriculture` | Agriculture | ME/Agri workload PDF (Agri filter) |

Future departments (Pharmacy, CSE, Civil, EE, MBA) add a folder under `backend/data/departments/<slug>/` with `config.json`, faculty email map, and source paths — no application code changes required.

## Architecture

```
Official PDFs
    ↓  parse-department-sources.py
Normalized CSVs (students.csv, faculty-workload.csv, course-catalog.csv)
    ↓  import-department.js
Validation → Transactional UPSERT → Import audit (department_import_runs)
    ↓
Reports in docs/
```

## Prerequisites

```bash
pip3 install pypdf
```

## Commands

From `backend/`:

```bash
# Parse PDFs → CSV (per department config)
npm run parse:department -- mechanical

# Full import (parse + validate + UPSERT + reports)
npm run import:department -- mechanical

# Validate only (no DB writes)
npm run import:department -- mechanical -- --dry-run

# Abort on any validation error
npm run import:department -- mechanical -- --strict

# Rollback latest completed run for a department
npm run rollback:department -- mechanical
```

## Data layout

```
backend/data/departments/<slug>/
  config.json                 # Department metadata + source paths
  faculty-email-map.json      # Faculty name → official email (data, not code)
  students.csv                # Generated from student PDF
  faculty-workload.csv        # Generated from workload PDF
  course-catalog.csv          # Derived course metadata
```

## Database

Migration `20260718180000_department_import_engine.sql` adds:

- `department_import_runs` — audit trail, validation snapshot, rollback metadata
- `academic_course_allocations.import_run_id` — links allocations to import runs

## Import behavior

### Students

- Source: **student list PDF/CSV** (name, email, batch, semester) — not the faculty workload PDF
- Match by `official_email`
- **Creates missing student login accounts** when `provision_missing_students` is true (default)
- **Forces `Student` role** on every import (fixes accounts that were wrongly created as Faculty via Google login)
- Enrollment ID extracted from official email (e.g. `sakib.23183493@...` → `23183493`)
- Default password: `password123`
- UPSERT `student_profiles` (batch, semester, section)
- Credentials for newly created accounts: `backend/data/departments/<slug>/import-credentials.csv`
- If roles were wrong before import: `node scripts/department-import/fix-student-roles.js mechanical`

### Faculty

- Resolve faculty by email from `faculty-email-map.json`
- **Creates missing faculty login accounts** when `provision_missing_faculty` is true (default)
- Default password for newly provisioned accounts: `password123` (same as other QA personas on sgvu tenant)
- UPSERT `academic_subjects`, `academic_courses`, `academic_course_allocations`
- Ensure `iam_programs` row for department programme
- Assign `import_run_id` on allocations for rollback

### Validation

- Duplicate students / courses / assignments in source files
- Missing programme, semester, faculty email, course code
- Invalid credits and email formats

Critical failures roll back the entire transaction when `--strict` is used.

## Reports

| File | Contents |
|------|----------|
| `docs/VALIDATION_REPORT.md` | Errors, duplicates, warnings |
| `docs/STUDENT_IMPORT_REPORT.md` | Updated / unchanged / skipped students |
| `docs/FACULTY_IMPORT_REPORT.md` | Workload assignments |
| `docs/COURSE_IMPORT_REPORT.md` | Subjects created or updated |
| `docs/MIGRATION_SUMMARY.md` | Run totals and run ID |

## Rollback

`rollback-department.js`:

1. Deletes allocations created/updated in the import run
2. Restores prior `student_profiles` snapshots stored in run summary
3. Marks run as `ROLLED_BACK`

## Adding a new department

1. Create `backend/data/departments/<slug>/config.json`
2. Add `faculty-email-map.json`
3. Point `sources` to official PDF or CSV files
4. Configure `workload_matrix` column order matching the official workload sheet
5. Run `npm run import:department -- <slug>`

## Production rules

- Do not hardcode production values in application TypeScript — use config + CSV only
- Do not manually edit the database for imports
- Use UPSERT; duplicates in source files are flagged, not silently merged
- All imports are reproducible from PDF → CSV → import command
