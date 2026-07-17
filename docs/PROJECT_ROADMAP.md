# Falcon Campus OS — Project Roadmap

Forward-looking plan for SGVU Campus OS beyond the Mechanical Engineering pilot.

---

## Completion status (July 2026)

| Area | Status |
|------|--------|
| ✅ Faculty Workspace | Teaching, attendance, grading, LMS, research funding |
| ✅ HOD Workspace | Course allocation, approvals, dept analytics, funding gate |
| ✅ Dean Workspace | School command center, inbox, result declaration approvals |
| ✅ Examination Cell | Full lifecycle + RBAC action matrix |
| ✅ QA | Launch checklist, smoke tests, regression suite |
| ✅ Security | RBAC, tenant isolation, Dean scope, IDOR fixes, audit |
| ✅ Testing | Phases A, B, B.1 — 283 tests, CI coverage gates |
| ✅ Documentation | Phase C enterprise docs (`docs/`) |
| ⬜ Registrar | Partial via `/admin`, `/admin-ops` — full module Q4 2026 |
| ⬜ President / VC | `/president` live; expanded executive workflows Q1 2027 |
| ⬜ Super Admin | Entity management live; tenant provisioning API planned |

---

## Current state

**Production-ready for pilot:** Mechanical Engineering department (`Mech Engg`) — see [MECHANICAL_PILOT_LAUNCH_CHECKLIST.md](./MECHANICAL_PILOT_LAUNCH_CHECKLIST.md).

**Also functional (ongoing polish):** Student, HR, Finance, IQAC, Admissions CRM, Leadership, Parent, Alumni, and 20+ additional portals.

---

## Phase 1 — Pilot stabilization (Q3 2026) ✅

| Item | Status |
|------|--------|
| Exam Cell RBAC hardening | ✅ Done |
| Dean result approval workflow | ✅ Done |
| Dean school scope / IDOR | ✅ Done |
| ME timetable seed | ✅ Done |
| Unified test suite + CI | ✅ Done |
| Enterprise documentation | ✅ Done |
| Student portal (ME batch) | 🔄 Optional — 5–10 students |
| Post-pilot sign-off | 📋 Pending HOD/Dean/COE |

---

## Phase 2 — Registrar module (Q4 2026) ⬜

Partial access exists today. Full expansion:

| Feature | Portal | Backend module |
|---------|--------|----------------|
| IAM & hierarchy | `/admin/iam` | `iam` |
| Admissions CRM | `/admissions-crm` | `admissions` |
| Student verifications | `/admin/student-verifications` | `student-onboarding` |
| Master calendar | `/admin-ops/calendar` | `admin-ops` |
| Convocation & certificates | `/admin-ops/convocation` | `certificate-automation` |
| University directory | `/directory` | `search` |
| Ph.D. admissions | `/admin/phd/admissions` | `phd-lifecycle` |

**Estimated effort:** 8–12 weeks (2 engineers + QA)

**Deliverables:** Registrar dashboard, bulk upload hardening, convocation batch generation, cross-portal audit for record changes.

---

## Phase 3 — President / VC workspace (Q1 2027) ⬜

| Feature | Route | Priority |
|---------|-------|----------|
| Finance & budgetary control | `/president/finance-budget` | High |
| HR approvals (tenure, hiring) | `/president/hr-approvals` | High |
| Executive orders | `/president/executive-orders` | Medium |
| Convocation oversight | `/president/convocation` | Medium |
| Compliance dashboard | `/president/compliance` | Medium |

**Estimated effort:** 6–8 weeks

Integration with Leadership (`/leadership`) for Chairman-level OTP approvals on high-value POs (≥ ₹1,00,000).

---

## Phase 4 — Super Admin & multi-entity (Q1–Q2 2027) ⬜

| Feature | Status | Next step |
|---------|--------|-----------|
| Multi-entity management | Partial | Tenant self-service API |
| Impersonation + audit | ✅ | — |
| Hierarchy editor | ✅ | — |
| Feature flags per tenant | Partial | Wire `FeatureGuard` |
| Cross-tenant analytics | 📋 | SaaS operator dashboard |

**Estimated effort:** 10–14 weeks for full SaaS provisioning pipeline.

---

## Phase 5 — Enterprise expansion (2027+)

- Roll out Faculty → HOD → Dean → Exam Cell chain department-by-department via `backend/scripts/build-*-seed-data.py`
- Integrations: Moodle SSO, DigiLocker, WhatsApp notifications, biometric attendance
- OpenAPI documentation from Nest decorators
- Live API integration tests in CI (`FALCON_LIVE_API=1`)

---

## Known gaps (backlog)

From [SYSTEM_MAP.md §10](./SYSTEM_MAP.md#10-known-gaps--dual-systems):

1. Exit clearance flags not auto-set by backend services
2. Dual gate-pass systems (hostel vs operations)
3. Dual HR leave systems (legacy + modern workflow)
4. Hostel request rejection endpoint missing
5. CompanyHR role has no portal mapping

Scheduled for Registrar/Operations consolidation in Phase 2.

---

## Success metrics (pilot)

| Metric | Target |
|--------|--------|
| CI `test:ci` pass rate | 100% on main/develop |
| Exam Cell RBAC 403 tests | Automated in integration suite |
| Dean approval turnaround | < 24 hours |
| HOD scope leaks | 0 incidents |
| API p95 (paginated lists) | < 500ms |

---

*Roadmap reviewed July 2026 — Phase C documentation complete.*
