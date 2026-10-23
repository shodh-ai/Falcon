# Local re-evaluation QA

This workflow covers only the two seeded Student Four / SMOKE101 requests:

- `a1000002-0000-4000-8000-000000000002`: assigned scenario
- `a1000003-0000-4000-8000-000000000003`: submitted report scenario

All workflow writes use `local_reevaluation_qa.cases`. Public applications,
academic marks/results, reports, enrollments and sessions are never updated.
The two QA result references are deliberately outside `academic_exam_results`.
They cannot be selected by the official result linker. No fees, integrations,
notifications or parent/student publications are triggered.

## Setup

Use a loopback PostgreSQL host and `NODE_ENV=development` (or `test`). Set
`REEVALUATION_QA_ENABLED=true` in the ignored local `backend/.env`, then run from
`backend`:

```powershell
$env:NODE_ENV='development'
node scripts/setup-re-evaluation-qa.js --apply
```

The script validates both original seed records before creating fixtures. It
copies the requests' original 42 marks into separate QA results with an explicit
sample maximum of 100. The submitted example retains its saved revised 46 marks.
The unrelated 48/100 QA academic marks remain untouched. Re-running setup does
not reset progress. The script checks public-table fingerprints before commit.

Restart the local backend after enabling the flag. Production, live deployment
labels, remote database hosts, an unset flag, other request IDs, wrong tenants
and unassigned faculty cannot use this workflow.

## Portal walkthrough

1. In Faculty → Re-evaluation, select the assigned demo request. In **Local QA
   workflow**, enter QA revised marks and notes, then **Submit QA report**.
2. In Exam Cell → Re-evaluations, select the same request. **Complete QA
   simulation** copies revised marks only into its separate QA result.
3. Use **Reset QA scenario** in Exam Cell to restore that fixture's initial state.
   The second request starts under review and is immediately ready for step 2.

The original request status shown outside the QA panel is a preserved seed
snapshot. The **QA status** in the panel is the simulation's current state.
Updates require the current version; stale or duplicate decisions fail closed.

## Checks

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/modules/exam-cell/re-evaluation-qa.spec.ts
```

The ordinary official-result guards remain in place, including rejection of QA
declaration sources. Disabling the local flag removes QA endpoint access without
deleting fixtures or modifying any academic record.
