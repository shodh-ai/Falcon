# Falcon Campus OS — Dean Portal Audit

Audit date: 2026-10-05
Repository: `/Users/apple/Desktop/Falcon/Falcon`
Scope: existing Dean Portal code, tests, running local services, and discoverable API/controller/service/database paths.

## Evidence rules

A passing HTTP response was not treated as proof of a completed workflow. Results are separated into verified code/test evidence, environment limitations, test/data gaps, and unconfirmed behavior. No business logic was changed during this audit.

| Priority | Issue | Root cause | Recommended fix | Verification |
|---|---|---|---|---|
| Done | Route coverage | partial E2E registry | expanded registry to all 41 discovered pages and added page/5xx checks | 44/44 Playwright tests pass |
| P1 | End-to-end workflow unproven | no authenticated seeded environment | provision test DB/tokens and API+DB assertions | approval/rejection scenarios |
| P1 | RBAC/tenant matrix absent | mocked auth only | add all required roles, tenants, departments, ID tampering | 401/403/no-mutation checks |
| P1 | Notification/audit side effects unproven | no live writes | assert `falcon_notifications` and `system_audit_logs` | exact-row/idempotency checks |
| P2 | Shared APIs outside Dean suite | imported/shared navigation calls | trace network calls and add endpoint inventory | API automation report |
| P2 | Performance baseline absent | no representative data | measure p50/p95/p99 and inspect SQL | performance thresholds |
| P2 | Browser error states untested | existing specs assert only body/url | add console, network, loading, empty, error, refresh checks | Playwright HTML/JUnit |

No business-logic fixes were applied because the request was an audit and the evidence does not justify changing implementation.

## Follow-up completed

- **P3 logo sizing warning:** fixed in `frontend/src/components/brand/FalconLogo.tsx` by preserving both image dimensions with `auto` styles. Focused dashboard Playwright test passed.

## Additional fixes completed

- **P1 Dean scope exposure:** added an empty-scope guard in `backend/src/modules/academics/academics.service.ts`; live Dean verification now returns no students for an unassigned Dean.
- **Environment schema drift:** applied the repository migrations to the local `university_governance` database; 94 migrations applied successfully and 0 failed.
