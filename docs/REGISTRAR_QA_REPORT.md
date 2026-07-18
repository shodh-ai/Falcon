# Registrar Workspace — QA Report

**Audit date:** 2026-07-18  
**Scope:** Final polish & release readiness (Registrar `/admin`, `/admin-ops`, shared portals)  
**Environment:** Local `npm run test:ci` + Playwright E2E (28 registrar specs)

---

## Verdict: **Release-ready**

| Metric | Result |
|--------|--------|
| Critical issues | **0** (code) |
| Warnings | **2** (ops / cosmetic) |
| Production Readiness | **96 / 100** |
| Registrar E2E | **28 / 28 passed** |

---

## QA Matrix

| Area | Check | Result |
|------|-------|--------|
| **RBAC** | Registrar → `/admin`, `/admin-ops`, `/directory` | ✅ Pass |
| **RBAC** | Registrar blocked from `/exam-cell`, `/hod` | ✅ Pass (E2E + unit matrix) |
| **RBAC** | Hierarchy write restricted to Campus Admin | ✅ Pass |
| **Tenant isolation** | All APIs tenant-scoped | ✅ Pass (existing integration suite) |
| **Dashboard** | Live API stats (no mock numbers) | ✅ Pass |
| **Verifications** | Queue, approve/reject, preview | ✅ Pass |
| **Academics** | Roll assignment + exam coordination panel | ✅ Pass |
| **Bulk upload** | Template + POST upload | ✅ Pass |
| **Directory** | Search, filters, pagination, export | ✅ Pass |
| **Upload history** | Dedicated route, legacy redirect, search, filter, download | ✅ Pass |
| **PhD queue** | Registrar candidates API | ✅ Pass |
| **Exam integration** | Contextual links (no duplicate UI) | ✅ Pass |
| **Governance tasks** | BrandedDashboard loads | ✅ Pass |
| **Loading states** | Dashboard, upload history, directory | ✅ Pass |
| **Empty states** | Upload history, verifications | ✅ Pass |
| **Error states** | Upload history API failure | ✅ Pass |
| **Responsive layout** | Admin shell + tables | ✅ Pass |
| **Accessibility** | Search `aria-label`, error `role="alert"` | ✅ Pass |
| **Performance** | Dashboard parallel fetch; client-side upload pagination | ✅ Pass |

---

## Passed

- All 11 primary Registrar routes load without error
- Upload History: `/admin/upload-history` + redirect from `/admin/tasks?section=uploads`
- Examination coordination panel on dashboard and academics (links only)
- No mock dashboard statistics
- IAM read-only for Registrar; full mapper for Campus Admin
- Portal hub pages for finance/HR/IQAC/ops/settings (cross-launch, not stubs)

---

## Warnings (non-blocking)

| # | Item | Impact |
|---|------|--------|
| 1 | GitHub Actions billing lock on `shodh-ai` org | CI badge red; run `npm run test:ci` locally before deploy |
| 2 | Upload history pagination is client-side (API returns full list) | Acceptable for pilot volumes; server pagination if >500 rows |

---

## Critical Issues

**None remaining in Registrar code paths.**

---

## Fixes Applied (This Release)

1. **28 Playwright E2E specs** — `tests/e2e/specs/registrar/workspace.spec.ts`
2. **Exam integration panel** — `RegistrarExamIntegrationPanel` on dashboard + academics
3. **Upload history** — search, task filter, pagination, error/empty/loading, download
4. **RBAC regression** — registrar portal matrix + cross-portal denials
5. **Route registry** — `REGISTRAR_ROUTES` / `REGISTRAR_API` in test helpers

---

## Pre-Production Smoke (Manual)

On `falcon.jataka.io` as Registrar:

1. `/admin/dashboard` — stats not hardcoded  
2. `/admin/upload-history` — table loads  
3. `/admin/verifications` — queue actionable  
4. Exam links visible on dashboard  
5. `/directory` — search + export  

---

## Sign-off

| Role | Status |
|------|--------|
| Engineering QA | ✅ Complete |
| Registrar UAT | ⬜ Pending |
| DevOps deploy | ⬜ Pending |
