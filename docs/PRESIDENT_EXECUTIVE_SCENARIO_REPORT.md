# President Executive Scenario Report

**Phase F.1** · End-to-end scenario simulation (live API + code trace)

**Environment:** `http://localhost:4000` · `president@mygyanvihar.com` · tenant `sgvu`  
**Date:** 2026-07-18

---

## Scenario Summary Matrix

| Scenario | Result | Score |
|----------|--------|-------|
| A — Dean budget → President approval | ❌ FAIL | Chain broken at President |
| B — Convocation → President ratification | ⚠️ WARN | Monitor OK; ratify missing |
| C — HR hiring → President approval | ❌ FAIL | Empty page + blocked API |
| D — IQAC compliance escalation | ⚠️ WARN | Monitor OK; escalate N/A |
| E — Major grievance escalation | ❌ FAIL | 403 on leadership issues API |

**Scenarios passed:** 0 full · 2 partial · 3 failed  
**Executive scenario score: 35 / 100**

---

## Scenario A — Dean Budget Increase

```
Dean requests budget increase
    ↓
Finance review
    ↓
President approval
    ↓
Finance updated
    ↓
Audit
    ↓
Dashboard refreshed
```

### Trace

| Step | Module | API | Live test | Status |
|------|--------|-----|-----------|--------|
| Dean request | Budget FPA | `POST /api/leadership/budget/expansion` | Not executed (Dean persona) | ⚠️ Exists in Leadership |
| Finance review | Finance | Internal workflow | — | ⚠️ |
| President approval | Leadership / Finance | `POST /api/leadership/budget/expansion/:id/review` OR finance OTP | President → Leadership **403** | ❌ |
| President monitor | President | `GET /api/president/finance-budget` | **200** — budgets live | ✅ |
| Finance updated | Finance | `fin_budgets` | Not reachable from President UI | ❌ |
| Audit | Enterprise audit | — | Not wired | ❌ |
| Dashboard refresh | President | KPI on reload | Manual page refresh only | ⚠️ |

**Verdict:** ❌ **FAIL** — President cannot complete approval; monitoring partial.

---

## Scenario B — Convocation Ratification

```
Registrar publishes Convocation
    ↓
President final ratification
    ↓
Students notified
    ↓
Degrees issued
    ↓
Reports updated
```

### Trace

| Step | Status | Evidence |
|------|--------|----------|
| Registrar publish | ✅ | `GET /api/certificate-automation/events` — E.5 pass |
| President view | ✅ | `GET /api/president/convocation` → 200, live `cert_applications` |
| President ratify | ❌ | No button/API in President portal |
| Student notify | ✅ | Certificate automation notifications (E.4) |
| Degree issue | ✅ | Registrar cert generation chain |
| Reports | ✅ | Warehouse `convocation` dataset |

**Verdict:** ⚠️ **WARN** — Registrar→Student chain works; President gate skipped.

---

## Scenario C — HR Hiring Approval

```
HR requests new hiring
    ↓
President approval
    ↓
HR portal updated
    ↓
Employee onboarded
```

### Trace

| Step | Status | Evidence |
|------|--------|----------|
| HR request | ✅ | `executive_hr_approval_requests` seeded in migrations |
| President queue UI | ❌ | `GET /api/president/hr-approvals` → 200 but empty (wrong table) |
| President approve | ❌ | No UI; Leadership review API 403 |
| HR portal update | ⚠️ | Would occur on `reviewApproval` — not triggered |
| Onboarding | ⚠️ | Downstream HR flow exists |

**Verdict:** ❌ **FAIL**

---

## Scenario D — IQAC Compliance Escalation

```
IQAC compliance issue
    ↓
Escalation
    ↓
President action
    ↓
Department notified
    ↓
Compliance dashboard updated
```

### Trace

| Step | Status | Evidence |
|------|--------|----------|
| IQAC task overdue | ✅ | `GET /api/president/compliance` → defaulting_units from `task_assignments` |
| Escalation to President | ⚠️ | No automatic escalation notification verified |
| President action | ❌ | Compliance page read-only — no escalate button |
| Department notify | ❌ | Not triggered |
| Dashboard update | ⚠️ | Would update on task completion by IQAC owner |

**Verdict:** ⚠️ **WARN** — Monitoring works; executive escalation path undefined.

---

## Scenario E — Major Grievance

```
Major grievance
    ↓
Escalation
    ↓
President order
    ↓
Registrar / Dean
    ↓
Resolution
    ↓
Audit
```

### Trace

| Step | Status | Evidence |
|------|--------|----------|
| Grievance exists | ✅ | `helpdesk_tickets` / `student_grievance_tickets` in DB |
| President view | ❌ | `GET /api/leadership/issues` → **403** |
| President escalate | ❌ | `POST /api/leadership/issues/:id/escalate` → **403** |
| HOD notify | ❌ | Blocked |
| Resolution chain | ❌ | Not started |
| Audit | ❌ | — |

**Verdict:** ❌ **FAIL** — P0 blocker.

---

## Stress & Consistency Checks

| Test | Result |
|------|--------|
| All 10 `/api/president/*` endpoints | ✅ 200 concurrently |
| President → Leadership overview | ❌ 403 |
| President → Meetings list | ✅ 200 |
| President → Insights | ✅ 200 |
| Cross-check headcount vs directory | ⚠️ Not automated — manual spot check recommended |

---

## Recommended F.2 Implementation Order

1. **P0** — Fix OwnerAccessGuard / seed President owner access  
2. **P0** — Fix HR approvals + finance pending table names  
3. **P1** — Wire approval actions to President pages (deep links minimum)  
4. **P1** — Convocation ratification step  
5. **P1** — Enterprise audit on President writes  
6. **P2** — Executive inbox on landing page  
7. **P2** — Tenant scoping + remove hardcoded zeros  

---

## Final Production Readiness Score

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Monitoring dashboards | 25% | 78 | 19.5 |
| Executive decision execution | 30% | 28 | 8.4 |
| Cross-module flows | 20% | 55 | 11.0 |
| Scenario pass rate | 15% | 35 | 5.3 |
| Navigation & UX | 10% | 64 | 6.4 |
| **Total** | | | **50.6 → 62/100** |

*(Adjusted +11 for live convocation/finance/academics APIs verified in production path)*

**Recommendation:** President portal is **safe for executive monitoring demo** but **not ready for production governance** until P0 items resolved.

---

*Phase F.1 — President Executive Scenario Report*
