# Registrar Workspace — Test Summary

**Date:** 2026-07-18  
**Release target:** Registrar final polish

---

## Summary

| Suite | Tests | Passed | Failed |
|-------|-------|--------|--------|
| **Registrar Playwright E2E** | 28 | 28 | 0 |
| **Registrar unit (route registry)** | 2 | 2 | 0 |
| **RBAC regression (updated)** | 9+ | All | 0 |

**Command:**

```bash
cd tests && npm run test:e2e -- e2e/specs/registrar/workspace.spec.ts
```

---

## Registrar E2E Coverage

### Route smoke (11 routes)

| Route | Path |
|-------|------|
| Dashboard | `/admin/dashboard` |
| Governance Tasks | `/admin/tasks` |
| Upload History | `/admin/upload-history` |
| IAM | `/admin/iam` |
| Verifications | `/admin/verifications` |
| Academics | `/admin/academics` |
| Bulk Upload | `/admin/students/bulk-upload` |
| Directory | `/directory` |
| PhD Admissions | `/admin/phd/admissions` |
| Admin Ops | `/admin-ops/dashboard` |
| Reports | `/reports` |

### Feature tests

| Feature | Specs |
|---------|-------|
| Dashboard live stats + exam panel | 1 |
| Verifications queue | 1 |
| Academics + exam links | 1 |
| Bulk upload surface | 1 |
| PhD queue | 1 |
| Governance tasks | 1 |
| Upload history (route, redirect, search, filter, download, empty, error) | 7 |
| Directory search + results | 2 |
| RBAC (exam cell blocked, nav link) | 2 |

### API mocks (E2E)

`tests/e2e/helpers/registrar-api-mocks.ts` stubs:

- `/api/search/directory` + filters  
- `/api/admin/student-verifications/queue`  
- `/api/leadership/issues`  
- `/api/helpdesk/tickets/profile-corrections`  
- `/tasks/submissions/my`  
- `/tasks/assignments/my`  
- `/api/phd-lifecycle/registrar/candidates`  
- `/api/super-admin/hierarchy` + assignments  
- `/iam/*`  
- `/uploads/download`  

---

## Unit / Integration

| File | Purpose |
|------|---------|
| `tests/unit/registrar/registrar-workspace.spec.ts` | Route + API registry |
| `tests/helpers/workflow-routes.ts` | `REGISTRAR_ROUTES`, `REGISTRAR_API` |
| `tests/helpers/rbac-matrix.ts` | Registrar portal + denials |
| `tests/unit/regression/rbac-regression.spec.ts` | Cross-portal guard regression |

---

## Test Users

| Role | Email |
|------|-------|
| Registrar | `dev.registrar@mygyanvihar.com` |

Configured in `tests/fixtures/users.json` and `PORTAL_MOCK_USERS.registrar`.

---

## CI Gate

Full pipeline:

```bash
cd tests && npm run test:ci
```

Includes all workspace E2E (faculty, HOD, dean, exam cell, **registrar**) + coverage thresholds.

---

## Result

**All Registrar tests pass.** Workspace meets release gate for automated QA.
