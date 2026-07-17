# Mechanical Engineering Pilot — Pre-Launch Checklist

Use this checklist before opening **HOD Workspace**, **Dean Workspace**, **Examination Cell**, and (optionally) the **Student portal** for the Mechanical Engineering department (`Mech Engg` in the database).

Mark each item only after you have **verified** it in the target environment (staging or production)—not on local `npm run dev` alone.

---

## 1. Database migrations (most important)

All pending migrations must be applied on the **production database** before go-live.

### Run migrations

From `Falcon/backend`:

```bash
cp .env.example .env   # if not already configured
# Set DATABASE_URL / DB_* in .env for the production database

npm run db:migrate
```

Alternative (single critical file, if you must apply manually):

```bash
psql "$DATABASE_URL" -f migrations/20260717100000_exam_result_dean_approval_requests.sql
```

### Critical migration — Dean result approval

| File | Purpose |
|------|---------|
| `migrations/20260717100000_exam_result_dean_approval_requests.sql` | Creates `exam_result_dean_approval_requests` and `exam_result_dean_approval_history` for the real Dean → COE result workflow |

Without this migration, Exam Cell “Submit for Dean Approval” and Dean inbox result approvals **will fail**.

### Mechanical academic seed (recommended for pilot)

| File | Purpose |
|------|---------|
| `migrations/20260713140000_me_timetable_workload_seed.sql` | ME timetable, faculty workload, student enrollments |
| `migrations/20260710120000_dean_school_scope_mapping.sql` | Dean school ↔ department mapping (includes Mech Engg) |

### Verification

- [ ] `npm run db:migrate` completed without errors on production DB
- [ ] Table `exam_result_dean_approval_requests` exists
- [ ] Department `Mech Engg` exists and has an HOD assigned (`departments.hod_user_id`)
- [ ] Dean scope includes Mechanical (`dean_school_departments` or equivalent mapping)

---

## 2. Backend + frontend deploy

### Backend

- [ ] Production `.env` configured: `DATABASE_URL`, `JWT_SECRET`, Redis (if used), mail/S3 as required
- [ ] Tenant / subdomain settings match your SGVU deployment
- [ ] Build passes: `npm run build` in `backend/`
- [ ] Process running (e.g. port **4000** or your prod URL behind reverse proxy)
- [ ] Health check: `GET /api/...` responds with valid auth

### Frontend

- [ ] Production env: API base URL points to deployed backend (not `localhost:4000`)
- [ ] Build passes: `npm run build` in `frontend/`
- [ ] Static/hosted deployment serves the `(portals)` routes (`/hod`, `/dean`, `/exam-cell`, `/student`)
- [ ] Google / local login works on the production domain

### Environment checklist

| Variable / setting | Verified |
|--------------------|----------|
| Database connection | [ ] |
| JWT / session secret | [ ] |
| Tenant subdomain (`x-tenant-subdomain` / tenant resolver) | [ ] |
| Frontend `NEXT_PUBLIC_*` API URL | [ ] |
| CORS / cookie domain (if applicable) | [ ] |

---

## 3. Users & roles (Mechanical Engineering)

Create or confirm real users—not demo accounts—for the pilot.

| Role | Assignment | Verified |
|------|------------|----------|
| **HOD** | User linked to **Mech Engg** department (`departments.hod_user_id` or HOD role + `dept_id`) | [ ] |
| **Dean** | User scoped to the school that includes **Department of Mechanical Engg / Mech Engg** | [ ] |
| **Controller of Examination (COE)** | `examcell` or `superadmin` with full exam actions | [ ] |
| **Exam Admin** | `examadmin` — sessions, schedules, seating (no publish/UFM) | [ ] |
| **Exam Operator** | `examoperator` — admit cards, seating only | [ ] |

### RBAC smoke (each role, separate login)

- [ ] COE can publish results, approve UFM, manage question papers
- [ ] Exam Admin **cannot** publish results (expect **403**)
- [ ] Exam Operator **cannot** lock marks or declare results (expect **403**)
- [ ] HOD sees only Mechanical dept data (not other departments’ funding/attendance)
- [ ] Dean sees only school-scoped departments including Mech Engg

---

## 4. Five-minute smoke test

Run these in **production** (or staging that mirrors prod) with real test logins.

### HOD Workspace

- [ ] Open inbox / pending approvals
- [ ] Funding request flow (list + approve/reject scoped to ME)
- [ ] Attendance policy request visible and actionable

### Dean Workspace

- [ ] Inbox loads with pagination
- [ ] **Result Declaration Approvals** panel visible when Exam Cell submits
- [ ] Approve with comment → status updates
- [ ] Reject without comment → validation error; with comment → succeeds

### Examination Cell

- [ ] Hall ticket approvals list loads (paginated)
- [ ] Submit result session for **Dean approval** (not simulated `deanApproved=true`)
- [ ] After Dean approves → COE can **declare** / publish
- [ ] Audit log shows actions with actor and timestamp

### Security (403 checks)

- [ ] Log in as **Exam Operator** → attempt `POST /api/exam-cell/results/publish` → **403**
- [ ] Log in as **Exam Operator** → attempt UFM create → **403**
- [ ] Log in as **Exam Admin** → attempt declare result → **403**

---

## 5. Student portal (optional Mechanical pilot)

The student portal is **not** gated by HOD/Dean/Exam hardening. Enable separately when ready.

Per student:

- [ ] `Student` role assigned
- [ ] `dept_id` → Mech Engg
- [ ] `onboarding_status = COMPLETED` (after admin approval at `/admin/verifications`)
- [ ] `student_profiles` row with enrollment / batch / semester
- [ ] Timetable and enrollments present (ME seed migration or live data)

Pilot recommendation: start with **5–10 ME students**, then expand batch-wise.

---

## Do NOT launch if

Stop and fix before go-live if **any** of these are true:

- [ ] ❌ Migrations have **not** been run on the production database
- [ ] ❌ Only local `npm run dev` is running—no production backend URL or hosted frontend
- [ ] ❌ Mechanical **HOD** and **Dean** users are not assigned to the correct dept/school scope
- [ ] ❌ Dean result approval migration missing (workflow will break at declare time)
- [ ] ❌ Smoke test 403 checks fail (RBAC regression)
- [ ] ❌ Builds fail (`backend`: `npm run build`, `frontend`: `npm run build`)

---

## Post-launch monitoring (first 48 hours)

- [ ] Watch backend logs for 500 errors on `/api/academics/dean/*` and `/api/exam-cell/*`
- [ ] Confirm Dean receives notifications for pending result approvals
- [ ] Confirm Exam Cell audit log records declare/publish events
- [ ] Gather HOD/Dean/Exam Cell feedback before opening to all ME students

---

## Related docs

- [SYSTEM_MAP.md](./SYSTEM_MAP.md) — roles, portals, workflows
- [backend/docs/E2E_STUDENT_QA.md](../backend/docs/E2E_STUDENT_QA.md) — student portal QA paths
- Production readiness report (HOD / Dean / Exam Cell hardening) — see team handoff / chat summary

---

**Sign-off**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| IT / DevOps | | | |
| COE / Exam Cell | | | |
| Dean (Mech school) | | | |
| HOD (Mechanical) | | | |
