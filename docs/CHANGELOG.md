# Changelog

All notable changes to Falcon SGVU Campus OS. Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased] — 2026-07 Hardening Sprint

### Security

- **Exam Cell RBAC action matrix** — Server-side `assertExamCellAction()` on sensitive endpoints; mirrors frontend `exam-cell-rbac.ts`. ExamAdmin and ExamOperator receive 403 on publish, declare, UFM, and question paper routes.
- **Dean school scope** — `resolveDeanScope()` enforces department boundaries on all Dean intelligence and academic endpoints; cross-school IDOR returns 403.
- **HOD department scope** — Funding, student monitor, and approval endpoints filter by HOD's assigned department.
- **Dean result approval workflow** — Replaced simulated `deanApproved=true` flag with real `exam_result_dean_approval_requests` table and Dean inbox decision API. COE cannot declare until Dean approves.
- **Impersonation read-only guard** — Global guard blocks writes during SuperAdmin impersonation.

### Added

- **Dean portal** (`/dean`) — Dedicated school command center separate from HOD workspace: departments, analytics, faculty leaderboard, budget, research, placement dashboards.
- **Dean intelligence API** — `/api/academics/dean/intelligence/*` for enterprise analytics, audit log, notifications, executive report export.
- **Exam Cell audit log** — Paginated `GET /api/exam-cell/audit-log` with actor, action, timestamp for compliance.
- **Grade card PDF export** — `GET /api/exam-cell/grade-cards/:gradeCardId/export/pdf` using pdf-lib.
- **Pagination utilities** — Shared `parseListQuery()` / `PaginatedResponse<T>` applied to Dean inbox, hall ticket approvals, audit logs, and other high-volume lists (default limit 20, max 100).
- **Unified test suite** — `tests/` folder with unit, integration, and Playwright E2E smoke; CI workflow `.github/workflows/falcon-tests.yml`.
- **Mechanical Engineering seed** — Migration `20260713140000_me_timetable_workload_seed.sql` for ME timetable, faculty workload, student enrollments.
- **Documentation set** — ARCHITECTURE, API_REFERENCE, DEVELOPER_GUIDE, TESTING_GUIDE, SECURITY_GUIDE, DEPLOYMENT_GUIDE, PROJECT_ROADMAP, ENTERPRISE_SUMMARIES.
- **Enterprise demo seed generator** — `backend/scripts/generate-enterprise-demo-seed.js` for parameterized SQL output.

### Changed

- **Dean inbox** — Paginated list with result declaration approvals panel integrated.
- **Hall ticket approvals** — Paginated queue with bulk approve support.
- **Result control pipeline** — New states: open entry → lock marks → submit for Dean approval → declare → publish.
- **Exam Cell roles expanded** — DeputyCOE, ExamAdmin, ExamOperator sub-roles with granular action matrix (previously binary ExamCell access).
- **HOD funding approvals** — Scoped to department; Dean escalation path for cross-dept requests.

### Fixed

- IDOR on student monitor detail endpoints (HOD/Dean scope validation).
- Dean reject without comment now returns validation error (comment required).
- Unique partial index prevents duplicate pending Dean approval requests per result session.
- Pagination offset/page parameter inconsistencies across list endpoints.

### Tests & QA

- **Phase A** — Unified `tests/` infrastructure (Jest, Supertest, Playwright, Vitest)
- **Phase B** — 283 automated tests across unit, integration, frontend, E2E
- **Phase B.1** — Coverage CI gates, backend module verify script, regression suite
- Key areas: exam-cell RBAC, dean scope, pagination, tenant isolation, portal access E2E

### Documentation

- **Phase C** — Enterprise docs: ARCHITECTURE, API_REFERENCE, DEVELOPER_GUIDE, SECURITY_GUIDE, DEPLOYMENT_GUIDE, TESTING_GUIDE, CHANGELOG, PROJECT_ROADMAP

---

## [2026-07] — Testing Phases B & B.1

### Added

- RBAC-aware mock API gateway for Supertest CI
- Backend guard/util unit specs (jwt-auth, pending-request, roles-guard, …)
- Integration suites: auth, RBAC, search/filter, workflows, security
- Frontend Vitest: RoleGate, PaginationBar, notifications, exam-cell components
- Playwright: login-form, dean search, exam publish workflow
- GitHub Actions coverage artifacts

---

## [Prior releases]

Earlier Falcon development included:

- Multi-tenant SaaS foundation (`tenants`, subdomain routing)
- 27 portal shells (Student, Faculty, HOD, HR, Finance, IQAC, Exam Cell, …)
- HR workflow engine with configurable approval chains
- Admissions CRM kanban pipeline
- BullMQ async job infrastructure
- Enterprise performance indexes (Phase 1)
- Campus events 4-tier approval workflow
- Alumni conversion pipeline

See [SYSTEM_MAP.md](./SYSTEM_MAP.md) for full feature inventory.

---

## Migration reference (recent)

| Migration | Description |
|-----------|-------------|
| `20260717100000_exam_result_dean_approval_requests.sql` | Dean approval tables |
| `20260713140000_me_timetable_workload_seed.sql` | ME pilot seed |
| `20260710120000_dean_school_scope_mapping.sql` | Dean ↔ school mapping |
| `20260614130000_enterprise_performance_phase1.sql` | Performance indexes |
| `20260613150000_performance_indexes.sql` | Earlier index sprint |

---

*For deployment impact, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) and [MECHANICAL_PILOT_LAUNCH_CHECKLIST.md](./MECHANICAL_PILOT_LAUNCH_CHECKLIST.md).*
