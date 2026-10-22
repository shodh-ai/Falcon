# Falcon Campus OS — Deployment Guide

Production deployment steps for SGVU Campus OS, with emphasis on the **Mechanical Engineering pilot** (HOD, Dean, Exam Cell).

---

## Pre-deploy checklist

Complete [MECHANICAL_PILOT_LAUNCH_CHECKLIST.md](./MECHANICAL_PILOT_LAUNCH_CHECKLIST.md) before enabling pilot users.

**Do NOT launch if:**

- Migrations not applied on production database
- Only local `npm run dev` is running (no hosted backend/frontend)
- HOD/Dean users not assigned to correct dept/school scope
- Dean result approval migration missing
- RBAC 403 smoke tests fail

---

## Architecture (typical production)

```mermaid
flowchart LR
  User[Browser] --> Nginx[Nginx / Coolify]
  Nginx --> FE[Next.js :3000]
  Nginx --> API[NestJS :4000]
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> S3[(S3 / MinIO)]
```

Single VPS (Coolify) or split: app server + managed PostgreSQL.

### Docker (local infrastructure)

`docker-compose.yml` at repository root:

| Service | Port | Purpose |
|---------|------|---------|
| postgres | 5434→5432 | `university_governance` |
| redis | 6380 | BullMQ |
| minio | 9000/9001 | S3-compatible uploads |
| prometheus | 9090 | Metrics scrape |
| grafana | 3001→3000 | Dashboards |

```bash
docker compose up -d    # from Falcon/
```

Backend and frontend run on the **host** during local dev (not containerized in compose).

### Docker (production images)

| Image | Dockerfile | Port | Coolify base dir |
|-------|------------|------|------------------|
| API | `backend/Dockerfile` | 4000 | `backend/` |
| Web | `frontend/Dockerfile` | 3000 | `frontend/` |

Backend image: multi-stage Node 20 Alpine, includes `migrations/`, `scripts/`, and `data/departments/` (department import CSVs).

Frontend image: Next.js standalone output; build args for `NEXT_PUBLIC_API_URL`, tenant subdomain, Google client ID.

### Post-deploy: department data (ME + Agriculture)

After backend redeploy, exec into the API container (or run on host with production `DB_*` in `.env`):

For a host command, first set the production safety environment in §1. Do not
reuse a local development `.env` or bootstrap flags.

```bash
npm run db:migrate
npm run bootstrap:departments
```

This imports committed CSVs for `mechanical` and `agriculture` and syncs student enrollments. Override departments with `BOOTSTRAP_DEPARTMENTS=mechanical`.

Single department:

```bash
npm run import:department -- mechanical --skip-parse
npm run sync:department-enrollments -- mechanical
```

---

## 1. Database

### Run migrations

Use a separately provisioned production environment with reviewed `DB_*`
connections and secrets supplied by deployment tooling. `.env.example` is for
local development and is **not** a production configuration.

```bash
cd backend
# Required before migrations; do not inherit local bootstrap/demo/seed flags.
export NODE_ENV=production DATABASE_ENV=production DEPLOYMENT_ENV=production
export DB_SYNCHRONIZE=false ALLOW_SCHEMA_BOOTSTRAP_SYNC=false
export ALLOW_STANDARD_SEED=false DOFA_QA_SEED_ENABLED=false ALLOW_MOCK_PAYMENTS=false
export NEXT_PUBLIC_EXAM_CELL_DEV_FALLBACK=false NEXT_PUBLIC_FACULTY_DEMO_MODE=false NEXT_PUBLIC_STUDENT_DEMO_MODE=false
# DB_HOST/PORT/USERNAME/PASSWORD/DATABASE and the reviewed manifest are
# supplied securely by deployment tooling, not copied from local examples.
npm run db:migrate
```

### Production migration review guard

Production startup now refuses **all unreviewed pending migrations**. Historical
SQL includes account creation, credential resets and data seeds; do not approve
the entire directory or infer safety from filenames. A maintainer must compare
the target database's migration ledger with the tested release, review each
specific pending SQL file and confirm its data impact and backup/recovery plan.
Existing applied migrations are skipped. Production schema synchronization,
`--force`, `--repair`, `--seed` and `--dofa-qa-seed` are refused.
Direct `npm run db:sync` is also local-only: it requires explicit bootstrap
opt-in and refuses every production marker before connecting or synchronizing.

For reviewed forward migrations only, provide a JSON file with this shape:

```json
{
  "version": 1,
  "migrations": {
    "20261017100000_exam_result_session_identity.sql": "REPLACE_WITH_REVIEWED_FILE_SHA256"
  }
}
```

The placeholder is deliberately invalid: replace it with the exact lowercase
64-character SHA-256 of the reviewed release file, calculated with
`shasum -a 256 backend/migrations/<reviewed-file>.sql`. Include every pending file
only after review, never generate a blanket approval. Any missing entry, changed
file hash, unknown filename or invalid manifest stops startup **before the first
migration or ledger write**. SQL execution uses the reviewed bytes.

Mount this reviewed file read-only in the backend container and set
`PRODUCTION_MIGRATION_MANIFEST=/run/falcon/reviewed-migrations.json` at runtime.
`NODE_ENV=production`, `DATABASE_ENV=production` or
`DEPLOYMENT_ENV=production` enables the guard; a conflicting local marker cannot
disable it. No manifest is needed if there are no pending migrations.

Use explicit `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` and `DB_DATABASE`
for both the app and migration runner. `DATABASE_URL` alone is not consumed by
the current implementation. Never copy local example passwords or QA accounts
into an internet-facing deployment.

### Critical migrations (pilot)

| File | Required for |
|------|--------------|
| `20260717100000_exam_result_dean_approval_requests.sql` | Dean result approval workflow |
| `20260710120000_dean_school_scope_mapping.sql` | Dean school scope |
| `20260713140000_me_timetable_workload_seed.sql` | ME timetable & enrollments |
| `20260614130000_enterprise_performance_phase1.sql` | Performance indexes |

Verify:

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'exam_result_dean_approval_requests'
);
```

### Connection pooling

Production `.env`:

```env
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_POOL_IDLE_MS=30000
DB_SYNCHRONIZE=false
TYPEORM_LOGGING=false
```

For 500+ concurrent users, add PgBouncer — see [PERFORMANCE.md](./PERFORMANCE.md).

---

## 2. Backend deploy

```bash
cd backend
# With the separately provisioned DB/secrets and reviewed migration manifest:
export NODE_ENV=production DATABASE_ENV=production DEPLOYMENT_ENV=production
export DB_SYNCHRONIZE=false ALLOW_SCHEMA_BOOTSTRAP_SYNC=false
export ALLOW_STANDARD_SEED=false DOFA_QA_SEED_ENABLED=false ALLOW_MOCK_PAYMENTS=false
export NEXT_PUBLIC_EXAM_CELL_DEV_FALLBACK=false NEXT_PUBLIC_FACULTY_DEMO_MODE=false NEXT_PUBLIC_STUDENT_DEMO_MODE=false
npm ci --include=dev
npm run build
npm run db:migrate
npm run start:prod    # or PM2 / Docker CMD
```

### Required environment variables

| Variable | Notes |
|----------|-------|
| `NODE_ENV=production` | Disables dev login |
| `JWT_SECRET` | Strong random secret |
| `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE` | Explicit production PostgreSQL settings; `DATABASE_URL` alone is unsupported |
| `REDIS_HOST` | Required for BullMQ queues |
| `FRONTEND_URL` | Production frontend URL (OAuth redirect) |
| `DEFAULT_TENANT_SUBDOMAIN` | e.g. `sgvu` |
| `SAAS_BASE_DOMAIN` | Production domain |
| `GOOGLE_CLIENT_ID/SECRET` | Production OAuth credentials |
| `S3_*` | Production object storage |
| `EMAIL_*` | External email configuration; does not enable Examination Cell delivery |

### Examination Cell first-release scope (22 October 2026)

Examination Cell `EMAIL`, `SMS` and `WHATSAPP` campaigns return **503** before
campaign or delivery writes. Their delivery adapters currently log/stub delivery;
setting provider credentials does not implement these channels. `IN_APP` campaign
persistence and student retrieval were verified with synthetic data on the
identified disposable local database only.

The product owner selected **in-app notifications only** for the first release.
Keep external notification channels disabled. Email/SMS/WhatsApp delivery and
DigiLocker are deferred integrations; adding credentials must not expose stub
delivery as successful delivery.

Payment gateway capture/settlement and OTP delivery still need a safe provider
sandbox before those workflows can be enabled for live use. A synthetic payment
fixture or local login does not verify these providers. Required-fee applications
must remain blocked until a genuine matching settlement is confirmed.

Local verification on 22 October passed a fresh production-mode backend startup,
backup restore into the explicitly approved disposable recovery database, and
the three reviewed backlog/revaluation/hall-ticket forward migrations. Existing
academic records were unchanged by those migrations. This does not establish
recovery or migration safety for an unidentified production database: the target
ledger, reviewed migration manifest, private storage, HTTPS, secrets, backups,
monitoring and role/departments setup still require authorized deployment checks.

Backlog offerings require explicit authorized staff configuration of fees,
attempt limits, grading rules and BEST/LATEST selection policy. No default
academic policy is supplied. The supported source components are INTERNAL and
END_TERM. Published retake attempts are immutable; retake correction/revaluation,
MID_TERM retakes and UFM closure/penalty reversal are not implemented workflows.
Do not use direct database edits as a staff workflow for these cases.

### Health check

```bash
curl -s -o /dev/null -w "%{http_code}" https://api.yourdomain.com/auth/me
# Expect 401 without token (proves server is up)
```

### Reverse proxy

- Route `/api/*` and `/auth/*` to backend :4000
- Enable GZIP (also enabled in Nest `main.ts`)
- WebSocket support if using live notifications

---

## 3. Frontend deploy

```bash
cd frontend
npm ci --include=dev
npm run build
npm run start       # or static export + CDN
```

### Required configuration

- API base URL → production backend (not `localhost:4000`)
- Cookie domain aligned with SSO if using subdomain tenants
- All `(portals)` routes served: `/hod`, `/dean`, `/exam-cell`, `/faculty`

Verify build:

```bash
npm run build   # uses the project's explicit webpack configuration; must exit 0
```

---

## 4. Redis & background workers

BullMQ queues require Redis for:

- Notification delivery
- HR payroll / document export
- Finance bulk demands
- Lead scoring

If Redis is down, synchronous paths may work but async jobs will fail silently — monitor queue depth in production.

---

## 5. Post-deploy smoke test (5 minutes)

Run with **production test accounts** (see checklist §4):

| Role | Test |
|------|------|
| HOD | Inbox, funding approval (ME scope only) |
| Dean | Inbox pagination, result approval approve/reject |
| ExamCell | Submit dean approval → declare after approve |
| ExamOperator | `POST /api/exam-cell/results/publish` → **403** |
| ExamAdmin | Declare result → **403** |

---

## 6. User & role provisioning

| Role | DB assignment |
|------|---------------|
| HOD | `departments.hod_user_id` for Mech Engg |
| Dean | `schools.dean_user_id` + dean_school_departments mapping |
| ExamCell | `user_roles` → ExamCell role |
| ExamAdmin | ExamAdmin role (limited actions) |
| ExamOperator | ExamOperator role (admit cards + seating only) |

Use `/admin/iam` (Registrar/SuperAdmin) or direct SQL in controlled migrations.

---

## 7. Monitoring (first 48 hours)

From [MECHANICAL_PILOT_LAUNCH_CHECKLIST.md](./MECHANICAL_PILOT_LAUNCH_CHECKLIST.md):

- [ ] Watch logs for 500s on `/api/academics/dean/*` and `/api/exam-cell/*`
- [ ] Dean notifications for pending result approvals
- [ ] Exam Cell audit log records declare/publish
- [ ] Gather HOD/Dean/COE feedback before full student rollout

### Log patterns to alert on

```
ForbiddenException.*publish_results
QueryFailedError.*exam_result_dean_approval
ECONNREFUSED.*redis
```

---

## 8. Rollback strategy

1. **Frontend:** redeploy previous build artifact
2. **Backend:** redeploy previous `dist/` — backward-compatible if no new required migrations
3. **Database:** migrations are forward-only; test rollback scripts separately. Do not drop approval tables if Dean workflow is live.

---

## 9. CI/CD pipeline

```mermaid
flowchart TB
  subgraph gha [GitHub Actions — falcon-tests.yml]
    A[Checkout] --> B[npm ci]
    B --> C[db:migrate:test]
    C --> D[test:ci]
    D --> E[Upload coverage + Playwright report]
  end
```

| Stage | Command | Failure impact |
|-------|---------|----------------|
| Typecheck | `tsc` + backend build + frontend `tsc` | Blocks merge |
| Lint | ESLint on tests + frontend test dirs | Blocks merge |
| Coverage | Jest + Vitest thresholds | Blocks merge |
| Build | `npm run build` both apps | Blocks merge |
| E2E | Playwright 55+ specs | Blocks merge |

Triggers: push/PR to `main`, `develop`.

---

## 10. CI gate before deploy

```bash
cd tests && npm run test:ci
```

GitHub Actions: `.github/workflows/falcon-tests.yml` on `main`/`develop`.

---

## Related documentation

| Doc | Purpose |
|-----|---------|
| [MECHANICAL_PILOT_LAUNCH_CHECKLIST.md](./MECHANICAL_PILOT_LAUNCH_CHECKLIST.md) | **Primary go-live checklist** |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Local setup & env vars |
| [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) | RBAC verification |
| [PERFORMANCE.md](./PERFORMANCE.md) | Pooling & indexes |
| [TESTING_GUIDE.md](./TESTING_GUIDE.md) | Pre-deploy test commands (Phases A–B.1) |

---

## Sign-off template

| Role | Name | Date |
|------|------|------|
| IT / DevOps | | |
| COE / Exam Cell | | |
| Dean (Mech school) | | |
| HOD (Mechanical) | | |

---

*Deploy backend migrations before frontend when Dean result approval features are included in the release.*
