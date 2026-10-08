# Falcon Campus OS — Dean Portal Audit

Audit date: 2026-10-05
Repository: `/Users/apple/Desktop/Falcon/Falcon`
Scope: existing Dean Portal code, tests, running local services, and discoverable API/controller/service/database paths.

## Evidence rules

A passing HTTP response was not treated as proof of a completed workflow. Results are separated into verified code/test evidence, environment limitations, test/data gaps, and unconfirmed behavior. No business logic was changed during this audit.

## Static authorization evidence

The main academics and Dean intelligence controllers use `JwtAuthGuard` and `RolesGuard`; Dean operations are decorated for `Dean` and `SuperAdmin`. Frontend `auth-routing.ts` maps `/dean` to the Dean role and allows Dean into selected shared modules.

## Test status

| Control | Result |
|---|---|
| No token rejected | PASS — live 401 checks |
| Dean token allowed | WARN — only mocked E2E/integration evidence |
| Student/Faculty/HOD/Registrar/President blocked | SKIP — no live role tokens |
| Direct API authorization | WARN — guard code exists, live role matrix absent |
| Cross-tenant/cross-department isolation | SKIP |
| ID manipulation/no mutation | SKIP |
| Restricted HR/finance data | SKIP |

No privilege escalation was proven or disproven in this run. A P1 security verification gap remains because role and tenant isolation tests need real tokens and seeded records.
