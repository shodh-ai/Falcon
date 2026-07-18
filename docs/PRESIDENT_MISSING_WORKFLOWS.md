# President Missing Workflows & Broken Integrations

**Phase F.1** · Gaps discovered during executive journey audit

---

## P0 — Critical (Blocks executive function)

### P0-1 · Grievances page returns 403

| Item | Detail |
|------|--------|
| **Symptom** | `/president/issues` loads empty; escalate fails |
| **Root cause** | `LeadershipController` uses `OwnerAccessGuard` requiring row in `owner_access_control`. Only Chairman seeded (`20260612154500_seed_owner_access_control.sql`). President not included. |
| **API** | `GET /api/leadership/issues` → 403 |
| **Fix** | Seed President in `owner_access_control` OR exempt `issues`/`compliance-summary`/`escalate` from OwnerAccessGuard for President role |
| **Owner** | Platform / Leadership module |

### P0-2 · Entire Leadership module blocked for President

| Item | Detail |
|------|--------|
| **Symptom** | Frontend RBAC allows `/leadership/*`; all APIs 403 |
| **Impact** | No approvals inbox, financial oversight, executive memos, budget expansion review |
| **Fix** | Same as P0-1 — President executive access record |
| **Owner** | Platform |

### P0-3 · HR Approvals queries wrong table

| Item | Detail |
|------|--------|
| **Symptom** | `/president/hr-approvals` always empty |
| **Root cause** | `getHrApprovals()` queries `hr_approval_requests`; real table is `executive_hr_approval_requests` |
| **File** | `backend/src/modules/president/president.service.ts` |
| **Fix** | Align SQL with `executive-action.service.ts` |
| **Owner** | President module |

### P0-4 · Executive Orders table may not exist

| Item | Detail |
| **Symptom** | Executive Orders page always empty |
| **Root cause** | Queries `leadership_executive_orders` — no migration found; `.catch(() => [])` hides errors |
| **Fix** | Create migration + seed OR point to existing executive action orders table |
| **Owner** | Leadership / President module |

---

## P1 — High (Broken approval chains)

### P1-1 · Finance budget pending approvals wrong table

| Item | Detail |
|------|--------|
| **Symptom** | `pending_approvals` KPI always 0 |
| **Root cause** | Queries `finance_approval_requests`; actual table is `fin_approval_requests` |
| **File** | `president.service.ts` `getFinanceBudgetaryControl()` |
| **Fix** | One-line table name correction |

### P1-2 · No approve action on HR Approvals page

| Item | Detail |
|------|--------|
| **Symptom** | Page subtitle promises sign-off; UI is read-only `WorkspaceScaffold` |
| **Fix** | Deep-link to approval review OR embed `reviewApproval` action (F.2) |
| **Owner** | Frontend + Leadership API access |

### P1-3 · No convocation ratification for President

| Item | Detail |
|------|--------|
| **Symptom** | Convocation monitor only; Registrar completes chain without President gate |
| **Expected** | President ratify → notify students → audit |
| **Fix** | Wire `certificate-automation` verify/generate to President approval step |
| **Owner** | Registrar + President |

### P1-4 · Budget approval OTP flow not linked

| Item | Detail |
|------|--------|
| **Symptom** | President can call `POST /api/finance/approvals/:id/verify-otp` but no UI path |
| **Fix** | Link from Finance & Budget pending KPI |
| **Owner** | President frontend |

### P1-5 · No enterprise audit on President actions

| Item | Detail |
|------|--------|
| **Actions affected** | Escalate, approve, meeting minutes, budget OTP |
| **Fix** | Wire `EnterpriseAuditService` (pattern from Registrar E.4) |
| **Owner** | Platform |

### P1-6 · No executive inbox / morning briefing

| Item | Detail |
|------|--------|
| **Symptom** | Chairman has approvals inbox; President has scattered KPIs |
| **Fix** | Aggregate pending HR + finance + convocation + governance on Executive Summary |
| **Owner** | President module |

---

## P2 — Medium

| ID | Issue | Fix |
|----|-------|-----|
| P2-1 | Tenant scoping missing on fee_demands, enrollments, task_assignments, payslips | Add tenant filter to TypeORM queries |
| P2-2 | `patents_filed` hardcoded 0 in research hub | Wire to patents table or remove KPI |
| P2-3 | `grant_disbursements` hardcoded 0 in finance-budget | Wire to finance grants |
| P2-4 | Insights `scholarshipRoi` mocked | Label as estimated or compute from finance |
| P2-5 | Command palette missing Result Insights | Add to `presidentPortal.commandItems` |
| P2-6 | Reports warehouse not in President nav | Add Export Reports link (role already allowed) |
| P2-7 | Workspace switcher may route to broken Leadership | Hide Leadership workspace for President until P0 fixed |

---

## P3 — Low

| ID | Issue |
|----|-------|
| P3-1 | `/president/dashboard` duplicate of executive-summary |
| P3-2 | Catch-all `[...slug]` hides 404 mistakes |
| P3-3 | No export on workspace analytics pages |
| P3-4 | Finance vs Finance & Budget naming overlap |

---

## Missing Reports & Warehouse

| Expected | Status |
|----------|--------|
| President convocation in warehouse | ✅ Registrar E.4 dataset exists |
| President-specific executive snapshot export | ❌ Not in President nav |
| Audit log view for President | ❌ Leadership audit API blocked |

---

## Duplicate Responsibilities

| Function | President page | Better owner | Issue |
|----------|---------------|--------------|-------|
| Approvals | HR Approvals (empty) | Leadership Approvals | Duplicate + broken |
| Finance oversight | Finance + Finance Budget | Leadership Financial Oversight | President can't access Leadership |
| Compliance tasks | Compliance | IQAC portal | OK — President read-only is correct |

---

## Production Readiness by Workflow

| Workflow | Ready? |
|----------|--------|
| Monitor executive KPIs | ⚠️ 78% |
| Schedule meetings | ✅ 90% |
| Escalate grievances | ❌ 0% |
| Approve HR | ❌ 10% |
| Approve finance | ⚠️ 40% (API only) |
| Ratify convocation | ❌ 20% |
| Issue executive orders | ❌ 0% |
| IQAC compliance monitor | ✅ 85% |

**Overall President Production Readiness: 62 / 100**

---

*Phase F.1 — President Missing Workflows*
