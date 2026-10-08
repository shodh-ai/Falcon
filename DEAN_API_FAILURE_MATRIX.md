# Falcon Campus OS — Dean Portal Audit

Audit date: 2026-10-05
Repository: `/Users/apple/Desktop/Falcon/Falcon`
Scope: existing Dean Portal code, tests, running local services, and discoverable API/controller/service/database paths.

## Evidence rules

A passing HTTP response was not treated as proof of a completed workflow. Results are separated into verified code/test evidence, environment limitations, test/data gaps, and unconfirmed behavior. No business logic was changed during this audit.

| Area | Expected | Observed | Classification | Severity |
|---|---|---|---|---|
| Missing token | 401 | 401 on protected Dean APIs | Verified PASS | — |
| Wrong role | 403 | Not exercised with live token | Test/data gap | P1 |
| Cross-tenant ID | 403/404 with no mutation | Not exercised | Test/data gap | P1 |
| Invalid body/ID | 400/422 | Not exercised live | Test/data gap | P2 |
| Duplicate approval | idempotent conflict/no duplicate | Not exercised | Test/data gap | P1 |
| DB persistence | committed state visible on reload | Not available | Environment/data issue | P1 |
| Notification side effect | one correct recipient/event | Not available | Environment/data issue | P1 |
| Audit side effect | one complete audit row | Not available | Environment/data issue | P1 |
| Destination update | final module status changed | Not available | Test/data gap | P1 |
| Endpoint discovery | all frontend calls represented | 35 literal prefixes found; imported/shared calls need runtime tracing | Coverage gap | P2 |
