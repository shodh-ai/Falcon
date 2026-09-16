# Pharmacy LMS launch acceptance

The independently launchable module key is `lms_learning`. Do not activate the
Pharmacy cohort until the readiness endpoint returns `ready: true`.

## Required live data

For the target tenant and Pharmacy department, readiness verifies that all of
the following exist and are active:

- at least one programme represented by an active course allocation;
- at least one course linked to the department;
- at least one active faculty member allocated to a course;
- at least one active student enrolled in a course;
- the LMS quiz, forum, material and enrollment schema.

## Required acceptance evidence

Record each check separately for the Pharmacy department:

- `DATA_MIGRATION`: provider extracts imported, reconciled and signed off;
- `STORAGE_HEALTH`: upload, download, authorization and malware-scan smoke passed;
- `LMS_SMOKE`: faculty and student critical-path smoke passed;
- `SECURITY_ACCEPTANCE`: tenant, department, allocation and enrollment negative tests passed.

Evidence is append-only, content-hashed and may carry an expiry date. A missing,
failed or expired item makes readiness fail closed.

```http
POST /api/platform/module-readiness/lms_learning/evidence
Idempotency-Key: <unique-run-key>
Content-Type: application/json

{
  "scope_type": "DEPARTMENT",
  "scope_id": "<pharmacy-department-id>",
  "check_key": "LMS_SMOKE",
  "status": "PASS",
  "evidence_hash": "<sha256-of-test-report>",
  "details": { "report_reference": "<controlled-reference>" },
  "valid_until": "<ISO-8601 timestamp>"
}
```

Check the resulting decision with:

```http
GET /api/platform/modules/lms_learning/readiness?scope_type=DEPARTMENT&scope_id=<pharmacy-department-id>
```

## Pilot sequence

1. Apply `20260916120000_lms_independent_launch.sql`.
2. Import and reconcile provider data in a non-production rehearsal.
3. Run the LMS backend, frontend, HTTP, security and concurrency tests.
4. Run faculty and student storage smoke tests against the production-configured provider.
5. Record the four evidence items above.
6. Create a `PILOT` rollout for the Pharmacy department.
7. Have a different authorized business owner approve it.
8. Monitor authentication, content access, quiz attempts, forum activity, storage and audit logs.
9. Pause or roll back the department rollout if any scope or integrity check fails.

The `sis_academics` user interface may remain off. Its master-data projections
remain a read-only dependency; LMS activation does not expose the broader SIS
route set.
