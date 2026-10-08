# President Cross-Module Map

**Phase F.1** · Verified module chains affecting the President Workspace

---

## Map 1 — Dean → President → Dean

```
Dean (Academic KPIs)
    │
    ▼
student_course_enrollments · academic_marks · departments
    │
    ▼
GET /api/president/academics
GET /api/academics/insights/academic-performance
    │
    ▼
President Dashboard (monitor)
    │
    ✗ No Executive Order / memo to Dean from President portal
    │
    ▼
[DEAD END — P1]
```

**Intended:** President Order → Dean → Audit → Dean dashboard refresh  
**Actual:** Read-only analytics only

---

## Map 2 — Registrar → Convocation → President → Student

```
Registrar
    │ cert_applications · cert_events
    ▼
GET /api/president/convocation ✅ LIVE
    │
    ▼
President Convocation page (monitor)
    │
    ✗ No ratification API in President UI
    │
    ▼
Registrar ──► certificate PDF ──► Student Portal ──► Alumni
    │                              ✅ (E.4/E.5)
    ▼
Audit (cert_applications) ✅
```

**Gap (P1):** President ratification step missing; Registrar chain completes without President gate.

---

## Map 3 — Finance → Budget → President → Finance

```
Finance
    │ fin_budgets · fin_approval_requests
    ▼
GET /api/president/finance-budget
    │ ⚠️ pending_approvals queries wrong table name
    ▼
President (monitor pending count — often 0)
    │
    ✗ No approve button on President page
    │
    ▼
POST /api/finance/approvals/:id/verify-otp (exists, President allowed)
    │ Not linked from President nav
    ▼
Finance ledger updated · no audit
```

---

## Map 4 — HR → Hiring → President → HR → Payroll

```
HR
    │ executive_hr_approval_requests (real)
    ▼
GET /api/president/hr-approvals
    │ ❌ queries hr_approval_requests (empty)
    ▼
President HR Approvals page (empty table)
    │
    ✗ No approve/reject UI
    │
    ▼
Leadership Action Center /api/leadership/action/*
    │ ❌ OwnerAccessGuard blocks President
    ▼
[DEAD END — P0]
```

---

## Map 5 — IQAC → Compliance → President

```
IQAC / Admin
    │ task_assignments (Pending)
    ▼
GET /api/president/compliance ✅
    │
    ▼
President Compliance (defaulting_units list)
    │
    ▼
Decision: Monitor only ✅ (correct responsibility)
    │
    ✗ No escalate-to-department action from this page
```

---

## Map 6 — Helpdesk → Grievance → President → HOD

```
Helpdesk / Student Safety
    │ helpdesk_tickets
    ▼
GET /api/leadership/issues ❌ 403 for President
    ▼
/president/issues (broken)
    │
    ▼
POST escalate → HOD notification [blocked]
```

---

## Map 7 — President → Meetings → Participants

```
President
    │ POST /api/meetings/*
    ▼
meetings · meeting_participants
    │
    ▼
Notifications → Dean / HOD / Registrar / Faculty
    │
    ▼
Participant portals (/meetings or role-specific)
    │
    ▼
Minutes published → notification ✅
```

**Status:** ✅ Complete chain (audit missing — P2)

---

## Map 8 — Research → President

```
Faculty R&D applications
    │ academic_rnd_applications
    ▼
GET /api/president/research
    │
    ▼
President Research Hub
    │
    ▼
[DEAD END — monitor only]
```

---

## Cross-Module Responsibility Matrix

| Data owner | Sends to President via | President should | Actually can |
|------------|------------------------|------------------|--------------|
| Finance | fee_demands, fin_budgets | Approve high-value POs | Monitor only (OTP API exists elsewhere) |
| Registrar | cert_applications, verifications | Ratify convocation | Monitor only |
| HR | executive_hr_approval_requests | Sign off hires | Empty page + blocked Leadership |
| Dean | enrollments, marks | Issue academic directive | Monitor only |
| IQAC | task_assignments | Monitor compliance | ✅ Monitor |
| Helpdesk | tickets | Escalate to HOD | ❌ 403 |
| Exam Cell | academic_marks | Monitor results | ✅ Insights page |

---

*Phase F.1 — President Cross-Module Map*
