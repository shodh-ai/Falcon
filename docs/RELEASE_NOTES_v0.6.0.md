# Falcon Campus OS — Release Notes v0.6.0

**Release date:** July 2026  
**Codename:** Mechanical Engineering Pilot — Enterprise Readiness  
**Branch:** `main`

---

## Overview

v0.6.0 marks the completion of the Faculty → HOD → Dean → Examination Cell governance chain for the SGVU Mechanical Engineering pilot, with enterprise-grade QA, security hardening, automated testing, and production documentation.

---

## Major features

### Workspaces

| Workspace | Highlights |
|-----------|------------|
| **Faculty** | Attendance, assignments, grading, marks publish to COE, research funding requests |
| **HOD** | Course allocation, teaching matrix import, dept approvals, funding gate, compiled results |
| **Dean** | School command center, paginated inbox, escalated funding, **result declaration approvals** |
| **Examination Cell** | Full exam lifecycle, result control pipeline, hall tickets, seating, grade card PDF export |

### Dean result approval workflow

Real database-backed workflow replacing simulated flags:

- `exam_result_dean_approval_requests` + history tables
- COE submits → Dean approves/rejects → COE declares → publish
- Reject requires comment; unique pending index per session

### Security & RBAC

- Exam Cell **action matrix** (`assertExamCellAction`) — ExamOperator/ExamAdmin blocked from publish/UFM
- **Dean school scope** (`resolveDeanScope`) — cross-school IDOR prevention
- **HOD department scope** on funding, student monitor, approvals
- **Impersonation read-only guard** during SuperAdmin impersonation
- Shared **pagination** utilities (default limit 20, max 100)

---

## Testing summary

| Layer | Count | Tooling |
|-------|------:|---------|
| Unit | 107 | Jest |
| Integration | 48 (+ 9 gated live/DB) | Jest + Supertest mock gateway |
| Frontend | 73 | Vitest + RTL |
| E2E | 55 (+ 1 skipped) | Playwright |
| **Total** | **283** | `tests/` orchestrator |

**CI gate:** `cd tests && npm run test:ci` — typecheck, lint, coverage thresholds, production builds, E2E.

Coverage thresholds enforced:

- Unit harness ≥ 90% statements
- Integration mock ≥ 90% statements
- Frontend scoped components ≥ 85% statements

See [PHASE_B1_COVERAGE_REPORT.md](./PHASE_B1_COVERAGE_REPORT.md).

---

## Documentation summary

Phase C enterprise documentation:

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, RBAC, ER diagrams |
| [API_REFERENCE.md](./API_REFERENCE.md) | Pilot workspace REST endpoints |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Setup, conventions, CI/CD |
| [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) | RBAC, tenant isolation, audit |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Docker, Coolify, migrations |
| [TESTING_GUIDE.md](./TESTING_GUIDE.md) | Phases A–B.1 test suite |
| [CHANGELOG.md](./CHANGELOG.md) | Change history |
| [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md) | Future phases |

---

## Migrations (pilot-critical)

| Migration | Required for |
|-----------|--------------|
| `20260717100000_exam_result_dean_approval_requests.sql` | Dean result approval |
| `20260710120000_dean_school_scope_mapping.sql` | Dean school scope |
| `20260713140000_me_timetable_workload_seed.sql` | ME pilot seed |

Run: `cd backend && npm run db:migrate`

---

## Known limitations

Documented in [MISSING_DOCUMENTATION_REPORT.md](./MISSING_DOCUMENTATION_REPORT.md):

- No global API rate limiter (proxy-level recommended)
- No Helmet security headers in Nest (reverse proxy recommended)
- `FeatureGuard` defined but not wired to modules
- OpenAPI spec not auto-generated (68 controllers)
- Live API integration tests opt-in (`FALCON_LIVE_API=1`)

Legacy backlog (dual gate-pass, dual HR leave) tracked in [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md).

---

## Future roadmap

| Phase | Target | Status |
|-------|--------|--------|
| Registrar full module | Q4 2026 | ⬜ Partial today |
| President / VC expansion | Q1 2027 | ⬜ Portal live |
| Super Admin tenant API | Q1–Q2 2027 | ⬜ Partial today |

---

## Upgrade notes

1. Apply migrations before deploying backend.
2. Run `cd tests && npm run test:ci` before production deploy.
3. Rotate `JWT_SECRET` from example values.
4. Set `NODE_ENV=production` to disable dev-login endpoints.
5. Follow [MECHANICAL_PILOT_LAUNCH_CHECKLIST.md](./MECHANICAL_PILOT_LAUNCH_CHECKLIST.md).

---

*Falcon SGVU Campus OS v0.6.0 — Suresh Gyan Vihar University*
