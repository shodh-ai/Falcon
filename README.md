# Falcon — SGVU Campus OS

Monorepo: `backend/` (NestJS API), `frontend/` (Next.js portals), `tests/` (unified test suite), `docs/`.

Falcon is the unified operating system for **Suresh Gyan Vihar University** — academic governance from Faculty through HOD, Dean, Exam Cell, and Registrar (future), plus HR, finance, hostel, placements, and executive dashboards.

---

## Quick start (local)

```bash
# Backend
cd backend && npm install && cp .env.example .env && npm run db:migrate && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev
```

Open `http://localhost:3000` · API at `http://localhost:4000`

---

## Tests (Phase A — infrastructure)

```bash
cp tests/.env.test.example tests/.env.test
cd tests && npm install && npm test
```

From repo root: `npm test` · See [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md).

---

## Launch checklists

| Document | When to use |
|----------|-------------|
| [**Mechanical Pilot Launch Checklist**](./docs/MECHANICAL_PILOT_LAUNCH_CHECKLIST.md) | Before go-live for **Mech Engg** — migrations, deploy, roles, smoke tests |
| [**Deployment Guide**](./docs/DEPLOYMENT_GUIDE.md) | Production deploy steps |

---

## Documentation

### Architecture & design

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System overview, workspace hierarchy, auth, RBAC, DB entities |
| [SYSTEM_MAP.md](./docs/SYSTEM_MAP.md) | Roles, portals, workflows, notification bus |
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | REST endpoints by Faculty/HOD/Dean/Exam Cell |

### Development & operations

| Document | Description |
|----------|-------------|
| [DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) | Install, env vars, migrations, folder conventions |
| [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md) | Test suite, CI, `FALCON_LIVE_API`, `FALCON_E2E_LIVE` |
| [SECURITY_GUIDE.md](./docs/SECURITY_GUIDE.md) | RBAC, tenant isolation, Dean scope, audit logging |
| [DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) | Production deploy, migrations, monitoring |
| [PERFORMANCE.md](./docs/PERFORMANCE.md) | DB indexes, pooling, Redis cache |

### Planning & summaries

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](./docs/CHANGELOG.md) | Recent hardening (Exam RBAC, Dean approval, pagination, PDF, tests) |
| [PROJECT_ROADMAP.md](./docs/PROJECT_ROADMAP.md) | Registrar, President/VC, Super Admin future modules |
| [ENTERPRISE_SUMMARIES.md](./docs/ENTERPRISE_SUMMARIES.md) | Integration, security, performance, architecture reviews |

---

## Migrations

```bash
cd backend
npm run db:migrate
```

Critical pilot migration: `20260717100000_exam_result_dean_approval_requests.sql` (Dean result approval workflow).

---

## Demo seed generator

Generate scalable demo SQL (schools, departments, faculty, students):

```bash
cd backend
node scripts/generate-enterprise-demo-seed.js --schools=2 --departments=6 --faculty=30 --students=500
```

Output: `backend/scripts/output/enterprise-demo-seed.sql` (does not connect to DB).

---

## Workspace hierarchy

```
Faculty → HOD → Dean → Exam Cell → Registrar (future)
```

| Portal | Route | Primary role |
|--------|-------|--------------|
| Faculty | `/faculty` | Faculty |
| HOD | `/hod` | HOD |
| Dean | `/dean` | Dean |
| Exam Cell | `/exam-cell` | ExamCell, DeputyCOE, ExamAdmin, ExamOperator |
| Admin / Registrar | `/admin`, `/admin-ops` | Registrar, SuperAdmin |

---

## Repository structure

```
Falcon/
├── backend/          NestJS API, migrations, scripts
├── frontend/         Next.js portals under src/app/(portals)/
├── tests/            Unified Jest + Playwright suite
└── docs/             Documentation (this index)
```
