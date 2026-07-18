# President Decision Matrix

**Phase F.1** · Every President action: source, destination, API, notification, audit, end state

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ | Verified end-to-end |
| ⚠️ | Partial / monitor only |
| ❌ | Broken or missing |

---

## Monitoring Actions (No Write)

| Action | Page | API | Can edit? | Audit | End state |
|--------|------|-----|-----------|-------|-----------|
| View revenue KPIs | Executive Summary | `GET /api/president/executive-summary` | No | N/A | Display only ✅ |
| View academic stats | Academics | `GET /api/president/academics` | No | N/A | Display only ✅ |
| View grade insights | Result Insights | `GET /api/academics/insights/academic-performance` | No | N/A | Display only ⚠️ mock ROI |
| View fee breakdown | Finance | `GET /api/president/finance` | No | N/A | Display only ✅ |
| View budgets | Finance & Budget | `GET /api/president/finance-budget` | No | N/A | Display only ⚠️ |
| View R&D | Research Hub | `GET /api/president/research` | No | N/A | Display only ⚠️ |
| View IQAC defaults | Compliance | `GET /api/president/compliance` | No | N/A | Display only ✅ |
| View HR metrics | HR Analytics | `GET /api/president/hr-analytics` | No | N/A | Display only ✅ |
| View HR queue | HR Approvals | `GET /api/president/hr-approvals` | No | N/A | Empty ❌ |
| View exec orders | Executive Orders | `GET /api/president/executive-orders` | No | N/A | Empty ❌ |
| View convocation | Convocation | `GET /api/president/convocation` | No | N/A | Display only ✅ |
| Change password | Settings | `POST /api/auth/change-password` | Yes | ❌ | Account updated ✅ |

---

## Executive Actions (Write — Expected vs Actual)

| Executive action | Expected destination | API | Notification | Audit | Status |
|------------------|---------------------|-----|--------------|-------|--------|
| **Approve budget / PO** | Finance module | `POST /api/finance/approvals/:id/verify-otp` | ❌ | ❌ | ⚠️ API exists; not in President UI |
| **Approve HR hire/tenure** | HR employee record | `POST /api/leadership/action/approvals/:id/review` | ❌ | ❌ | ❌ Blocked OwnerAccessGuard |
| **Ratify convocation** | Registrar cert pipeline | *No API exposed* | Should notify students | Should audit | ❌ Missing |
| **Issue executive order** | leadership_executive_orders | *No create API in President portal* | Should broadcast | Should audit | ❌ Missing |
| **Escalate compliance / grievance** | HOD / Dept | `POST /api/leadership/issues/:id/escalate` | HOD email/in-app | ❌ | ❌ 403 |
| **Issue executive directive (memo)** | Role broadcast | `POST /api/leadership/action/memos` | Target roles | ❌ | ❌ Blocked |
| **Schedule executive meeting** | Participants | `POST /api/meetings/schedule` | ✅ Participants | ❌ | ✅ Works |
| **Request meeting (upward)** | Chairman / target | `POST /api/meetings/request` | ✅ Target user | ❌ | ✅ Works |
| **RSVP meeting** | Organizer | `POST /api/meetings/:id/respond` | ✅ Organizer | ❌ | ✅ Works |
| **Publish minutes** | Participants | `POST /api/meetings/:id/minutes` | ✅ Participants | ❌ | ✅ Works |
| **Reappropriate budget** | Finance budgets | `POST /api/leadership/financial/reappropriate` | ❌ | ❌ | ❌ Blocked |
| **Approve budget expansion** | Budget FPA | `POST /api/leadership/budget/expansion/:id/review` | ❌ | ❌ | ❌ Blocked |

---

## Decision → Module → Role Routing

| Decision | Should route to | Current routing |
|----------|-----------------|-----------------|
| Budget approval | Finance (`Accountant` executes) | Dead-end on President page |
| HR approval | HR Admin (`hr` portal) | Dead-end + wrong DB table |
| Convocation ratification | Registrar (`dev.registrar`) | No President action |
| Grievance escalation | HOD (`hod` portal) | API 403 |
| Academic intervention | Dean | No action path |
| Compliance overdue | IQAC coordinator | Monitor only (acceptable) |
| Meeting decision | Any invited role | ✅ Meetings module |

---

## Permission Correctness

| Page responsibility | Correct? | Notes |
|--------------------|----------|-------|
| Compliance read-only | ✅ | President should not edit IQAC tasks |
| Convocation monitor | ⚠️ | Should also ratify — missing write |
| HR Approvals read-only UI | ❌ | Page title implies sign-off but no buttons |
| Executive Orders log | ⚠️ | View-only OK if orders created elsewhere — but no creation path |
| Finance monitor | ✅ | Approve should deep-link to finance OTP flow |

---

## Recommended Decision Wiring (F.2 — not implemented in F.1)

| Priority | Action | Fix type |
|----------|--------|----------|
| P0 | Escalate grievance | Add President to `owner_access_control` OR exempt issues routes from OwnerAccessGuard |
| P0 | HR approvals data | Point `getHrApprovals()` to `executive_hr_approval_requests` |
| P1 | Budget pending count | Fix table name `fin_approval_requests` |
| P1 | HR approve button | Deep-link to Leadership approvals OR embed review on President page |
| P1 | Convocation ratify | Wire existing cert automation approve to President role |
| P2 | Enterprise audit | Log President approvals, escalations, ratifications |

---

*Phase F.1 — President Decision Matrix*
