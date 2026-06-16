# Falcon Performance & Concurrency Guide

Production tuning for the Next.js + NestJS + PostgreSQL stack on Coolify/VPS.

## Phase 1 — Database (PostgreSQL)

### Indexes

Run migrations after deploy:

```bash
cd backend && npm run db:migrate
```

Key migration: `20260614130000_enterprise_performance_phase1.sql` (finance demands, transactions, journals, grade cards, exam seating, shift allocations, leave date ranges).

Earlier sprint indexes live in `20260613150000_performance_indexes.sql`.

### N+1 fixes (implemented)

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /hr/attendance/matrix` | ~5 queries × N staff | 4 batched queries total |
| `GET /hr/ess/team/attendance` | Same N+1 | Batched + Redis cache (10 min) |
| Student exam desk seating | Load all seating plans | SQL filter via `LATERAL jsonb_array_elements` |

### Connection pooling

**TypeORM pool** (set in `.env`):

```env
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_POOL_IDLE_MS=30000
DB_POOL_CONNECT_MS=5000
TYPEORM_LOGGING=false
```

**PgBouncer** (recommended for 500+ concurrent staff):

1. Deploy PgBouncer as a separate Coolify service (or use managed DB with built-in pooling).
2. Point NestJS at PgBouncer, not PostgreSQL directly:

```env
DB_HOST=pgbouncer.internal
DB_PORT=6432
DB_POOL_MAX=10
```

3. PgBouncer config (`pool_mode = transaction`, `default_pool_size = 25`).

### Managed database

Move PostgreSQL off the app VPS when RAM/CPU is saturated:

- DigitalOcean Managed PostgreSQL, AWS RDS, or Supabase.
- Keep Redis and BullMQ workers on the app server; only DB moves.

---

## Phase 2 — Backend API (NestJS)

### Redis caching (implemented)

| Key pattern | TTL | Endpoint |
|-------------|-----|----------|
| `hr_att_matrix:{tenant}:{entity}:{month}` | 10 min | Attendance matrix |
| `hr_team_att:{tenant}:{manager}:{scope}:{month}` | 10 min | Team attendance matrix |
| `hr_dir:{tenant}:{entity}:…` | 15 min | HR directory |
| `hr_rules:{tenant}:{entity}` | 12 h | Attendance rules |
| `hr_shifts:{tenant}:{entity}` | 1 h | Shift list (existing) |

Invalidate caches when rules/shifts/directory data change (call `CacheService.delByPrefix('hr_dir:')` etc. from write handlers).

### Response compression

GZIP enabled in `main.ts` via `compression` middleware. Ensure Nginx/Coolify proxy also enables `gzip` / `brotli` for static assets.

### BullMQ (async work)

These queues already offload heavy work — **do not** run on the HTTP thread:

- Payroll runs (`payroll` queue)
- Document/ZIP exports (`document-export`)
- Finance bulk demands (`finance-bulk-demand`)
- Notifications (`notifications`)

HR Excel report exports in `hr.controller.ts` still run synchronously; migrate to the document-export queue pattern (return `202` + job id) when report volume grows.

### DTO trimming

Directory endpoint returns only UI fields (name, email, role, department, employee_id) — no password hashes or encrypted PII.

---

## Phase 3 — Frontend (Next.js)

### SWR caching

Global `SWRProvider` in root layout. Migrate high-traffic pages from `useEffect` + `useState` to `useAuthedSWR`:

```tsx
const { data, isLoading } = useAuthedSWR(['hr-dashboard'], (api) =>
  api.get<MasterDashboard>('/api/hr/dashboard/master'),
);
```

### Table virtualization

`VirtualizedDataTable` uses `@tanstack/react-virtual` for tables ≥ 50 rows. Used on hostel roll-call; apply to finance collections, exam seating, faculty grading as needed.

### Lazy charts

Leadership intelligence charts load via `next/dynamic` (same pattern as HR/IQAC dashboards).

### Next.js config

`next.config.ts`: `compress: true`, `optimizePackageImports` for lucide/recharts/echarts.

---

## Phase 4 — Infrastructure (Coolify VPS)

### Health check

```bash
htop          # RAM/CPU saturation?
docker stats  # per-container memory
```

Upgrade VPS tier (8–16 GB RAM) if Postgres + Redis + API + Next.js share one box and CPU stays at 100%.

### Service separation (recommended layout)

| Service | Host |
|---------|------|
| Next.js frontend | App VPS |
| NestJS API + BullMQ workers | App VPS |
| Redis | App VPS or managed Redis |
| PostgreSQL | **Managed DB** or dedicated VPS |
| PgBouncer | Between API and PostgreSQL |

### Nginx / Traefik (Coolify)

```nginx
gzip on;
gzip_types application/json application/javascript text/css;
gzip_min_length 1024;
```

Next.js standalone already compresses; double compression at the edge is fine for JSON API responses from NestJS.

---

## Environment checklist (production)

```env
# Backend
NODE_ENV=production
TYPEORM_LOGGING=false
DB_POOL_MAX=20
REDIS_HOST=127.0.0.1

# Frontend
NODE_ENV=production
```

## Measuring impact

1. Enable slow-query logging: `TYPEORM_SLOW_MS=200` (logs queries > 200 ms when logging is on).
2. Run `EXPLAIN ANALYZE` on any logged slow query.
3. Compare attendance matrix load time before/after (target: sub-500 ms for 200 staff with cache warm).
