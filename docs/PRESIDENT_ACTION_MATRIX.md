# President Action Matrix — Phase F.2

| President Action | UI Location | API | Source Table(s) | Destination Module | Notification | Audit Action |
|------------------|-------------|-----|-------------------|--------------------|--------------|--------------|
| View executive summary | Executive Summary | `GET /api/president/executive-summary` | users, finance_fee_demands, executive_hr_approval_requests, leadership_executive_orders, cert_applications | Dashboard (read) | — | — |
| Approve HR request | HR Approvals | `POST .../hr-approvals/:id/review` | executive_hr_approval_requests | HR dashboard + executive_tasks | Requester + HRAdmin | PRESIDENT_HR_APPROVED |
| Reject HR request | HR Approvals | same (approve:false) | executive_hr_approval_requests | HR dashboard | Requester | PRESIDENT_HR_REJECTED |
| Issue executive order | Executive Orders | `POST /api/president/executive-orders` | leadership_executive_orders, executive_tasks | Registrar/Dean/Finance/HR/IQAC/Ops inbox | Assignee | EXECUTIVE_ORDER_ISSUED |
| Complete executive order | Executive Orders | `PATCH .../executive-orders/:id/status` | leadership_executive_orders, executive_tasks | Destination module task queue | — | EXECUTIVE_ORDER_STATUS |
| Ratify convocation | Convocation | `POST .../convocation/:id/ratify` | cert_applications | Student certificates portal | Student | PRESIDENT_CONVOCATION_RATIFIED + CERTIFICATE_GENERATED |
| Decline ratification | Convocation | same (approve:false) | cert_applications | Registrar follow-up | Student | PRESIDENT_CONVOCATION_REJECTED |
| Assign investigation | Compliance | `POST .../compliance/:id/action` | task_assignments | IQAC / HOD | HOD or owner | PRESIDENT_COMPLIANCE_ASSIGN_INVESTIGATION |
| Escalate department | Compliance | action=ESCALATE_DEPARTMENT | task_assignments | Department HOD | HOD | PRESIDENT_COMPLIANCE_ESCALATE_DEPARTMENT |
| Request report | Compliance | action=REQUEST_REPORT | task_assignments | IQAC | HOD | PRESIDENT_COMPLIANCE_REQUEST_REPORT |
| Mark reviewed | Compliance | action=MARK_REVIEWED | task_assignments (→ Completed) | IQAC closure | HOD | PRESIDENT_COMPLIANCE_MARK_REVIEWED |
| Grievance executive decision | Grievances | `POST .../grievances/:ticketId/decide` | helpdesk_tickets | Assigned officer / student | Officer + student | PRESIDENT_GRIEVANCE_DECISION |
| Meeting action items | Meetings | `POST .../meetings/:id/action-items` | meeting_executive_action_items, executive_tasks | Assignee inbox | Assignees | MEETING_ACTION_ITEMS_CREATED |
| View leadership issues | Grievances | `GET /api/leadership/issues` | helpdesk_tickets | Escalation inbox | — | — |
| Schedule / minutes | Meetings | `/api/meetings/*` | portal_meetings | Meeting participants | Existing meeting notify | Existing meeting audit |

**Dead-end actions eliminated:** All rows above terminate in destination modules with audit + notification (except read-only dashboard views).
