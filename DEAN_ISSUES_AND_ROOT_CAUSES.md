# Falcon Campus OS — Dean Portal Audit

Audit date: 2026-10-05
Repository: `/Users/apple/Desktop/Falcon/Falcon`
Scope: existing Dean Portal code, tests, running local services, and discoverable API/controller/service/database paths.

## Evidence rules

A passing HTTP response was not treated as proof of a completed workflow. Results are separated into verified code/test evidence, environment limitations, test/data gaps, and unconfirmed behavior. No business logic was changed during this audit.

## Issues

### 1. Route coverage gap — resolved
- The Dean route registry was expanded from 10 entries to all 41 discovered pages.
- The strengthened Playwright suite now passes 44/44 tests and checks uncaught page errors and HTTP 5xx responses.
- Remaining limitation: tests still use mocked authentication and do not prove live API/database behavior.

### 2. Live persistence and workflow chain are unverified
- Issue: no test established UI → API → service → database → notification → audit → destination.
- Expected: each critical Dean action leaves consistent state across all layers.
- Actual: integration tests use a mock gateway; live APIs reject missing tokens with 401.
- Root cause: no usable authenticated seeded environment was available.
- Impact: approval correctness and data integrity cannot support a production claim.
- Severity: P1 (environment/test-data blocker).
- Recommended solution: provision test DB and role tokens, then run DB/API/UI assertions.
- Verification: complete approval/rejection scenarios and direct SQL checks.

### 3. RBAC/tenant matrix is not executed
- Issue: role, tenant, department, and manipulated-ID cases are absent from live tests.
- Expected: 401 unauthenticated and 403/404 unauthorized with no mutation.
- Actual: only no-token 401 behavior is verified.
- Root cause: mock auth does not provide a live multi-role matrix.
- Impact: possible authorization regressions remain unknown.
- Severity: P1 verification gap.
- Recommended solution: seed Student, Faculty, HOD, Dean, Registrar, President, Admin and cross-tenant records; automate API and UI checks.
- Verification: assert status, unchanged DB, and security audit behavior.

### 4. Notification and audit side effects are unverified
- Issue: code paths exist, but no action was observed producing rows.
- Expected: exactly one correct notification and audit record per important action.
- Actual: no live action was run.
- Root cause: same environment/data blocker.
- Impact: requesters may not be informed and compliance history may be incomplete.
- Severity: P1 for critical approvals, P2 for secondary actions.
- Recommended solution: add side-effect assertions and idempotency/concurrency tests.
- Verification: query `falcon_notifications` and `system_audit_logs` after each action.

### 5. Authenticated performance baseline is missing
- Issue: only 401/307 middleware timings were measured.
- Expected: dashboard/list/search/approval/report latency under representative data.
- Actual: no authenticated timings.
- Root cause: no seeded authenticated load.
- Impact: N+1 and large-payload problems may be missed.
- Severity: P2.
- Recommended solution: capture p50/p95/p99 for representative datasets and inspect SQL plans.
- Verification: performance report with thresholds and query traces.

## Follow-up runtime warning — resolved

- **Issue:** Next.js warned that `/logo.png` had one dimension modified without the other.
- **Root cause:** `FalconLogo` supplied fixed dimensions while runtime CSS could adjust one dimension.
- **Fix:** Added explicit `width: auto` and `height: auto` styles in `frontend/src/components/brand/FalconLogo.tsx`.
- **Verification:** Focused Dean dashboard Playwright test passed after the change.
- **Severity:** P3 cosmetic/runtime warning.

## Follow-up fixes completed

### Dean empty-scope data exposure — fixed

`listStudentsForDepartments` now returns an empty list when a Dean has no resolved department scope. This removes the previous `1=1` fallback that could return all tenant students. Verified with the seeded `dev.dean@mygyanvihar.com` account: `/api/academics/dean/students` returns `200 []`.

### Missing runtime tables — fixed locally

Applied 94 pending repository migrations to `university_governance` with zero migration failures. The previously missing `pv_outbox_events`, `inv_outbox_events`, and related consumption tables now exist. The backend was rebuilt and restarted.

## Screenshot follow-up: dashboard red flags vs Student Monitor

The first screenshot shows `attendance_deficits` rendered by the command-center response. The second page calls the paginated `/api/academics/dean/students?lowAttendance=true` endpoint and receives an empty result. These views must use the same resolved Dean department scope.

The root cause was the empty-scope fallback in `listStudentsForDepartments`: it previously used `1=1`, which could expose cross-department students in the dashboard while the paginated Student Monitor applied Dean scope. That fallback has been removed. A Dean with no mapped school/department now receives an empty list consistently. The affected deployed environment must apply the backend fix and assign the Dean account to the correct school/department scope before students will appear.
