# President Data Flow Audit

**Phase F.1** · Trace: Origin → Database → API → President UI → Decision → Destination

---

## Data Flow Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Verified live chain |
| ⚠️ | Partial / computed / fallback |
| ❌ | Broken or dead-end |

---

## 1. Executive Summary

```
Finance (Fee Demands) ──► fee_demands ──► PresidentService.getExecutiveSummary()
Admissions ──► users (PENDING_ADMIN_APPROVAL) ──► pending_student_verifications
Governance ──► task_assignments ──► pending_governance_tasks
HR/Students ──► users + roles ──► headcount
        │
        ▼
GET /api/president/executive-summary
        │
        ▼
/president/executive-summary (KPI cards)
        │
        ▼
Executive Decision: NONE (monitor only)
```

| Field | Table | Producer | Consumer |
|-------|-------|----------|----------|
| total_university_revenue | `fee_demands` | Finance billing | President |
| total_collected | `fee_demands` | Finance collections | President |
| headcount.students | `users` | Admissions/HR | President |
| pending_student_verifications | `users` | Student onboarding | President → should link Registrar |
| pending_governance_tasks | `task_assignments` | IQAC/Admin tasks | President → should link Compliance |

**Gap (P2):** Fee demands and task assignments queries omit `tenant_id`.

---

## 2. Academics

```
Faculty/Exam Cell ──► student_course_enrollments (+ users.dept)
        │
        ▼
GET /api/president/academics
        │
        ▼
/president/academics (schools table + chart)
        │
        ▼
Decision: NONE
```

---

## 3. Result Insights

```
Exam Cell ──► academic_marks, student_course_enrollments
Placement ──► placement_job_applications (optional)
        │
        ▼
GET /api/academics/insights/academic-performance
        │
        ▼
/president/insights (AcademicInsightsDashboard)
        │
        ▼
Decision: NONE
```

**Gap (P2):** `demographic.scholarshipRoi` is **hardcoded mock** in `insights.service.ts`.

---

## 4. Finance & Finance Budget

### Revenue page

```
Finance ──► fee_demands ──► GET /api/president/finance ──► /president/finance
```

### Budget page

```
Finance ──► fin_budgets + departments ──► department_budgets (live)
Finance ──► finance_approval_requests ❌ (should be fin_approval_requests)
        │
        ▼
GET /api/president/finance-budget
        │
        ▼
/president/finance-budget
        │
        ▼
Decision: NONE (pending_approvals often shows 0 incorrectly)
```

**Actual approval path (not in President UI):**

```
Finance ──► fin_approval_requests ──► POST /api/finance/approvals/:id/verify-otp
        │                                      (President role allowed)
        ▼
Finance ledger updated · NO audit · NO President portal link
```

---

## 5. Research Hub

```
Faculty R&D ──► academic_rnd_applications ──► GET /api/president/research
        │
        ▼
/president/research
```

| Field | Source |
|-------|--------|
| active_projects | ✅ Live count |
| grants_received | ✅ Sum funding_amount |
| patents_filed | ❌ Hardcoded `0` |
| extension_programs | ✅ Approved count alias |

---

## 6. Compliance

```
IQAC/Admin ──► task_assignments + task_master + users
        │
        ▼
GET /api/president/compliance
        │
        ▼
/president/compliance (defaulting_units table)
        │
        ▼
Decision: Monitor only (correct — President should not edit IQAC tasks)
```

---

## 7. HR Analytics & HR Approvals

### Analytics — ✅

```
HR ──► users, staff_payslips ──► GET /api/president/hr-analytics
```

### Approvals — ❌

```
HR ──► executive_hr_approval_requests (actual table)
        │
        ✗ President queries hr_approval_requests (wrong / empty)
        │
        ▼
GET /api/president/hr-approvals ──► empty approvals[]
```

**Correct approval chain (Leadership Action Center — blocked for President):**

```
HR ──► executive_hr_approval_requests
        │
        ▼
GET /api/leadership/action/approvals (Chairman only via OwnerAccessGuard)
        │
        ▼
POST reviewApproval ──► HR record updated
```

---

## 8. Grievances Escalation — ❌ P0

```
Helpdesk + Student Safety ──► helpdesk_tickets, student_grievance_tickets
        │
        ▼
GET /api/leadership/issues  ◄── BLOCKED 403 (OwnerAccessGuard)
GET /api/leadership/compliance-summary  ◄── BLOCKED 403
        │
        ▼
/president/issues (empty / error state)
```

**Intended flow when fixed:**

```
President escalate ──► POST /api/leadership/issues/:id/escalate
        │
        ▼
HOD notified · ticket priority updated · NO enterprise audit today
```

---

## 9. Executive Orders — ❌

```
Expected: leadership_executive_orders
        │
        ▼
GET /api/president/executive-orders (.catch → empty)
```

No write API under `api/president`. Creation/ratification not exposed to President portal.

---

## 10. Convocation

```
Registrar/Cert Automation ──► cert_applications, cert_events, student_profiles
        │
        ▼
GET /api/president/convocation (live after Registrar E.5 fixes)
        │
        ▼
/president/convocation
        │
        ▼
Decision: NONE in UI (Registrar owns verification; President should ratify — missing)
```

**Registrar chain (verified in E.5):**

```
Registrar ──► cert_applications ──► President monitor ──► [missing ratify]
        ──► Student portal / QR / alumni (Registrar path)
```

---

## 11. Meetings — ✅

```
President ──► POST /api/meetings/schedule|request|respond|minutes
        │
        ▼
meetings table ──► notifications to participants
        │
        ▼
/president/meetings
```

**Gap (P1):** No enterprise audit on meeting actions.

---

## Warehouse & Reports

President role can access `/reports` (auth-routing) but **not linked from President nav**.

| Dataset | President visibility |
|---------|---------------------|
| Warehouse exports | Via `/reports` only — not in President sidebar |
| Leadership intelligence | Blocked by OwnerAccessGuard |

---

## Audit Trail Coverage

| President-visible action | Enterprise audit | Notification |
|--------------------------|------------------|--------------|
| View KPI pages | N/A | N/A |
| Escalate grievance | ❌ | Would notify HOD |
| Approve HR (intended) | ❌ | ❌ |
| Approve budget (intended) | ❌ | ❌ |
| Schedule meeting | ❌ | ✅ |
| Publish minutes | ❌ | ✅ |
| Convocation ratify (missing) | ❌ | ❌ |

---

*Phase F.1 — President Data Flow Audit*
