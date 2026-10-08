# President Approval Chains — Phase F.2

## 1. HR Executive Approval

```
HR (HOD / Finance)
  → INSERT executive_hr_approval_requests (PENDING)
  → President Workspace (HR Approvals inbox)
  → POST /api/president/hr-approvals/:id/review
  → UPDATE executive_hr_approval_requests (APPROVED|REJECTED)
  → propagateHrApproval():
       • PAYROLL_BULK / BONUS: publish staff_payslips (if payload.payslip_ids)
       • INSERT executive_tasks → HRAdmin
       • NOTIFY requester + HRAdmin
  → Enterprise audit (PRESIDENT_HR_*)
  → Dashboard refresh (GET /api/president/hr-approvals)
```

**Correct table:** `executive_hr_approval_requests`  
**Removed incorrect reference:** `hr_approval_requests`

---

## 2. Executive Order Lifecycle

```
President
  → POST /api/president/executive-orders
  → INSERT leadership_executive_orders (ISSUED)
  → INSERT executive_tasks (linked_task_id)
  → NOTIFY destination role assignee
  → Recipient inbox (Registrar / Dean / Finance / HR / IQAC / Operations)
  → PATCH status: ACKNOWLEDGED → IN_PROGRESS → COMPLETED
  → UPDATE executive_tasks on COMPLETED
  → Audit at each transition
  → GET /api/president/executive-orders (President dashboard)
```

**No order disappears:** All rows persisted in `leadership_executive_orders` with status tracking.

---

## 3. Grievance Escalation

```
Student → helpdesk_tickets
  → Department resolution (escalation_level 1–2)
  → Dean / HOD (level 3)
  → Registrar / SLA auto (level 4, 48h breach)
  → President Escalation Inbox (GET /api/leadership/issues)
  → POST /api/president/grievances/:id/decide (requires level ≥ 4)
  → president_decision, assigned_officer_user_id, level 5
  → NOTIFY officer + student
  → Audit PRESIDENT_GRIEVANCE_DECISION
  → Resolution in operations module
```

---

## 4. Convocation Ratification

```
Student applies → cert_applications
  → Registrar verify (verification_status = VERIFIED, president_ratification_status = PENDING)
  → President pending list (GET .../pending-ratification)
  → POST .../ratify (approve)
  → president_ratification_status = RATIFIED
  → releaseCertificateAfterRatification → student portal download
  → Alumni conversion queue
  → Audit + student notification
  → Reports / warehouse via cert_applications + audit_log
```

---

## 5. Compliance Intervention

```
IQAC task_assignments (Pending)
  → President compliance view
  → POST compliance action (4 types)
  → task_assignments status update (MARK_REVIEWED → Completed)
  → NOTIFY HOD / owner
  → Audit PRESIDENT_COMPLIANCE_*
```

---

## 6. Meeting Minutes → Action Items

```
Meeting minutes published (portal_meetings)
  → President parses action_items lines: "Title | assignee_user_id"
  → POST /api/president/meetings/:id/action-items
  → meeting_executive_action_items + executive_tasks
  → NOTIFY assignees
  → Track via executive_tasks status + dashboard
  → Audit MEETING_ACTION_ITEMS_CREATED
```
