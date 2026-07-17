# Falcon Campus OS — API Reference

> **Base URL (local):** `http://localhost:4000`  
> **Auth:** `Authorization: Bearer <JWT>` unless marked `@Public()`  
> **Tenant:** Resolved from subdomain / `x-tenant-subdomain` header  
> **Architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md) · **Security:** [SECURITY_GUIDE.md](./SECURITY_GUIDE.md)

This document groups endpoints by workspace for the **Mechanical Engineering pilot**. The codebase contains 68 controllers and 500+ routes — grep `backend/src/**/*.controller.ts` for the full inventory. Patterns and pilot-critical endpoints are documented here.

---

## Conventions

### Pagination query params

```
GET /api/...?page=1&limit=20&search=term&sort=created_at&order=desc
```

Response:

```json
{
  "data": [ /* items */ ],
  "total": 87,
  "limit": 20,
  "offset": 0
}
```

### Typical error responses

```json
{ "statusCode": 403, "message": "Your role does not have permission to perform this action (publish_results)." }
```

```json
{ "statusCode": 401, "message": "Unauthorized" }
```

---

## Shared — Authentication

**Controller:** `backend/src/auth/auth.controller.ts`  
**Prefix:** `/auth` and `/api/auth`

| Method | Route | Auth | Roles | Description |
|--------|-------|------|-------|-------------|
| GET | `/auth/google` | Public | — | Start Google OAuth |
| GET | `/auth/google/callback` | Public | — | OAuth callback → redirect with JWT |
| POST | `/auth/local-login` | Public | — | Email/password login (dev/staging) |
| GET | `/auth/dev-login/:email` | Public | — | Dev-only quick login |
| GET | `/auth/me` | JWT | Any | Full profile + roles + onboarding |
| GET | `/auth/profile` | JWT | Any | Alias of `/me` |
| GET | `/auth/me/permissions` | JWT | Any | HR capabilities & permissions only |
| POST | `/auth/change-password` | JWT | Any | Change password |

**Example — login response (via `/auth/me` after token issued):**

```json
{
  "user_id": "uuid",
  "email": "hod@mygyanvihar.com",
  "role": "HOD",
  "roles": ["HOD", "Faculty"],
  "primaryRole": "HOD",
  "tenant_id": "a0000000-0000-4000-8000-000000000001",
  "is_department_hod": true,
  "onboarding_status": "COMPLETED",
  "hr_capabilities": { "leaves": "read" },
  "permissions": []
}
```

---

## Shared — Notifications

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/notifications` | JWT | In-app notification inbox |
| PATCH | `/api/notifications/:id/read` | JWT | Mark read |

---

## Faculty Workspace

**Controller:** `backend/src/modules/academics/academics.controller.ts`  
**Prefix:** `/api/academics`  
**Default guard:** `JwtAuthGuard`, `RolesGuard`

### Pattern: `/api/academics/faculty/*`

Faculty teaching endpoints share the role tuple `Faculty, HOD, Dean, SuperAdmin`.

| Method | Route | Key workflow |
|--------|-------|--------------|
| GET | `/faculty/today-classes` | Dashboard — today's schedule |
| GET | `/faculty/course/:courseId/students` | Roster for attendance |
| POST | `/faculty/attendance` | Mark session attendance |
| GET | `/faculty/assignments` | List digital assignments |
| POST | `/faculty/assignments` | Create assignment |
| POST | `/faculty/submissions/:submissionId/grade` | Grade submission |
| GET | `/faculty/workspaces/marks` | Marks entry workspace |
| POST | `/faculty/workspaces/marks/draft` | Save draft marks |
| POST | `/faculty/workspaces/marks/publish` | Submit marks to Exam Cell |
| GET | `/faculty/workspaces/timetable` | Personal timetable |
| POST | `/faculty/workspaces/adjustments` | Request extra class |
| GET | `/faculty/proxy-requests` | Proxy lecture requests |
| POST | `/faculty/workspaces/projects/:guideId/funding` | Submit project funding request |
| GET | `/faculty/placement/coordinator-status` | Placement coordinator gate |

**Example — mark attendance:**

```http
POST /api/academics/faculty/attendance
Authorization: Bearer <token>
Content-Type: application/json

{
  "course_offering_id": "uuid",
  "session_date": "2026-07-17",
  "records": [
    { "student_user_id": "uuid", "status": "PRESENT" }
  ]
}
```

```json
{ "saved": 42, "session_id": "uuid" }
```

---

## HOD Workspace

**Prefix:** `/api/academics/hod/*`  
**Roles:** `HOD`, `SuperAdmin` (some routes also `Dean`)

| Method | Route | Key workflow |
|--------|-------|--------------|
| GET | `/hod/dashboard` | Command center metrics |
| GET | `/hod/command-center` | Extended dashboard |
| GET | `/hod/faculty-workload` | Teaching load summary |
| GET | `/hod/course-allocation-slots` | Course allocation UI data |
| POST | `/hod/course-allocation` | Assign faculty to course |
| GET | `/hod/teaching-load/unassigned` | NF / unassigned slots |
| PATCH | `/hod/teaching-load/:allocationId/assign` | Assign faculty |
| POST | `/hod/course-mapper/preview` | Excel matrix preview |
| POST | `/hod/course-mapper/execute` | Bulk import teaching matrix |
| GET | `/hod/student-monitor` | Dept student list (paginated) |
| GET | `/hod/slow-learners` | At-risk students |
| GET | `/hod/result-analytics` | Pass/fail analytics |
| GET | `/hod/compiled-results/table` | Compiled semester results |
| GET | `/hod/funding-requests` | Project funding inbox |
| PATCH | `/hod/funding-requests/:requestId` | Approve/reject funding |
| GET | `/hod/approvals/extra-classes` | Extra class approvals |
| PATCH | `/hod/approvals/extra-classes/:adjustmentId` | Decide extra class |
| GET | `/hod/approvals/proxy-requests` | Proxy lecture approvals |
| PATCH | `/hod/approvals/proxy-requests/:proxyId` | Decide proxy |
| GET | `/hod/grievances` | Dept grievance escalations |
| GET | `/hod/appraisals` | Faculty appraisals |
| PATCH | `/hod/appraisals/:appraisalId/rating` | Submit HOD rating |

**Example — funding approval:**

```http
PATCH /api/academics/hod/funding-requests/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "decision": "APPROVED", "comment": "Within dept budget" }
```

---

## Dean Workspace

**Controllers:**
- `academics.controller.ts` — `/api/academics/dean/*`
- `dean-intelligence.controller.ts` — `/api/academics/dean/intelligence/*`

**Roles:** `Dean`, `SuperAdmin`

All Dean list endpoints accept pagination and are **scoped** to departments in the Dean's school via `resolveDeanScope()`.

### Academic oversight (`/api/academics/dean/*`)

| Method | Route | Key workflow |
|--------|-------|--------------|
| GET | `/dean/command-center` | School dashboard |
| GET | `/dean/departments` | Departments in school |
| GET | `/dean/faculty-workload` | Cross-dept workload |
| GET | `/dean/timetable` | School timetable |
| GET | `/dean/course-allocation` | Allocation review |
| GET | `/dean/syllabus-coverage` | LMS coverage |
| GET | `/dean/result-analytics` | Result analytics |
| GET | `/dean/students` | School student monitor |
| GET | `/dean/grievances` | Escalated grievances |
| POST | `/dean/grievances/:ticketId/resolve` | Resolve grievance |
| GET | `/dean/inbox` | Pending approvals (paginated) |
| GET | `/dean/funding-requests` | Escalated funding |
| PATCH | `/dean/funding-requests/:requestId` | Dean funding decision |

### Enterprise intelligence (`/api/academics/dean/intelligence/*`)

| Method | Route | Key workflow |
|--------|-------|--------------|
| GET | `/dashboard` | Intelligence dashboard |
| GET | `/analytics` | School analytics charts |
| GET | `/faculty-leaderboard` | Faculty ranking |
| GET | `/placement` | Placement dashboard |
| GET | `/research` | Research dashboard |
| GET | `/budget` | Budget monitoring |
| GET | `/search` | Global search |
| GET | `/notifications` | Notification center |
| GET | `/audit-log` | Audit trail |
| GET | `/reports/export` | PDF/CSV executive reports |
| GET | `/result-approvals` | **Result declaration approvals** |
| POST | `/result-approvals/:requestId/decision` | Approve/reject result session |
| GET | `/result-approvals/session/:sessionId/history` | Approval history |

**Example — Dean result approval:**

```http
POST /api/academics/dean/intelligence/result-approvals/550e8400-e29b-41d4-a716-446655440000/decision
Content-Type: application/json

{ "decision": "APPROVED", "comment": "Results reviewed for Mech Engg Sem VII" }
```

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "APPROVED",
  "session_id": "uuid",
  "decided_at": "2026-07-17T10:30:00Z"
}
```

Reject requires a non-empty `comment` (validation enforced server-side).

---

## Exam Cell Workspace

**Controller:** `backend/src/modules/exam-cell/exam-cell.controller.ts`  
**Prefix:** `/api/exam-cell`  
**Portal roles:** `ExamCell`, `DeputyCOE`, `ExamAdmin`, `ExamOperator`, `SuperAdmin`  
**Action RBAC:** `assertExamCellAction()` per sensitive route

### Pre-exam operations

| Method | Route | Action key | Key workflow |
|--------|-------|------------|--------------|
| GET | `/dashboard` | view_dashboard | Command center |
| GET | `/sessions` | manage_sessions | List exam sessions |
| POST | `/sessions` | manage_sessions | Create session |
| POST | `/sessions/:sessionId/status` | manage_sessions | Update session status |
| GET | `/schedules` | manage_schedules | Master exam schedule |
| POST | `/schedules` | manage_schedules | Create schedule entry |
| GET | `/eligibility/dashboard` | view_dashboard | Eligibility overview |
| GET | `/hall-ticket-approvals` | view_dashboard | Paginated hall ticket queue |
| POST | `/hall-ticket-approvals/:approvalId/advance` | generate_admit_cards | Advance approval step |
| POST | `/admit-cards/generate` | generate_admit_cards | Generate admit cards |
| POST | `/seating/auto-allocate` | manage_seating | Auto seating |
| POST | `/seating/publish-plans` | manage_seating | Publish seating plans |
| GET | `/invigilation` | view_dashboard | Invigilation roster |
| POST | `/invigilation/assign` | manage_seating | Assign invigilator |
| GET | `/question-papers` | manage_qp | QP control list |
| POST | `/question-papers` | manage_qp | Upload QP |
| GET | `/exam-day/today` | view_dashboard | Exam day ops |
| POST | `/exam-day/attendance` | view_dashboard | Exam day attendance |

### Post-exam / result control

| Method | Route | Action key | Key workflow |
|--------|-------|------------|--------------|
| GET | `/result-control/sessions` | view_dashboard | Result sessions |
| POST | `/result-control/sessions` | manage_sessions | Create result session |
| POST | `/result-control/sessions/:sessionId/open-entry` | manage_sessions | Open marks entry |
| POST | `/result-control/sessions/:sessionId/lock-marks` | publish_results | Lock marks |
| POST | `/result-control/sessions/:sessionId/dean-approval` | publish_results | **Submit for Dean approval** |
| POST | `/result-control/sessions/:sessionId/declare` | publish_results | Declare (after Dean OK) |
| POST | `/result-control/sessions/:sessionId/process` | publish_results | Process results |
| POST | `/results/publish` | publish_results | Publish to students |
| GET | `/grade-cards` | view_dashboard | Grade card list |
| POST | `/grade-cards/generate` | publish_results | Generate grade cards |
| GET | `/grade-cards/:gradeCardId/export/pdf` | view_dashboard | **PDF export** |
| GET | `/ufm-cases` | approve_ufm | UFM desk |
| POST | `/ufm-cases` | approve_ufm | Create UFM case |
| GET | `/re-evaluations` | view_dashboard | Re-evaluation queue |
| POST | `/re-evaluations/:applicationId/publish` | publish_results | Publish re-eval marks |
| GET | `/audit-log` | view_dashboard | Exam Cell audit log |

**Example — submit for Dean approval:**

```http
POST /api/exam-cell/result-control/sessions/<sessionId>/dean-approval
Authorization: Bearer <coe-token>
```

**Example — publish results (403 for ExamOperator):**

```http
POST /api/exam-cell/results/publish
Content-Type: application/json

{ "session_id": "uuid", "course_ids": ["uuid"] }
```

---

## 20 Pilot Workflows — Endpoint Map

| # | Workflow | Initiator | Key endpoints |
|---|----------|-----------|---------------|
| 1 | Faculty marks attendance | Faculty | `POST /api/academics/faculty/attendance` |
| 2 | Faculty publishes marks to COE | Faculty | `POST /api/academics/faculty/workspaces/marks/publish` |
| 3 | HOD course allocation | HOD | `POST /api/academics/hod/course-allocation` |
| 4 | HOD teaching matrix import | HOD | `POST /api/academics/hod/course-mapper/execute` |
| 5 | HOD funding approval | HOD | `PATCH /api/academics/hod/funding-requests/:id` |
| 6 | HOD extra class approval | HOD | `PATCH /api/academics/hod/approvals/extra-classes/:id` |
| 7 | HOD proxy lecture approval | HOD | `PATCH /api/academics/hod/approvals/proxy-requests/:id` |
| 8 | HOD compiled results view | HOD | `GET /api/academics/hod/compiled-results/table` |
| 9 | Dean school dashboard | Dean | `GET /api/academics/dean/command-center` |
| 10 | Dean inbox (paginated) | Dean | `GET /api/academics/dean/inbox` |
| 11 | Dean funding escalation | Dean | `PATCH /api/academics/dean/funding-requests/:id` |
| 12 | Dean result approval | Dean | `POST .../dean/intelligence/result-approvals/:id/decision` |
| 13 | COE submit for Dean approval | ExamCell | `POST /api/exam-cell/result-control/sessions/:id/dean-approval` |
| 14 | COE declare results | ExamCell | `POST /api/exam-cell/result-control/sessions/:id/declare` |
| 15 | COE publish results | ExamCell | `POST /api/exam-cell/results/publish` |
| 16 | Hall ticket approvals | ExamCell | `GET/POST /api/exam-cell/hall-ticket-approvals*` |
| 17 | Seating allocation | ExamCell | `POST /api/exam-cell/seating/auto-allocate` |
| 18 | Grade card PDF | ExamCell | `GET /api/exam-cell/grade-cards/:id/export/pdf` |
| 19 | UFM case management | ExamCell/DeputyCOE | `POST /api/exam-cell/ufm-cases` |
| 20 | Exam audit trail | ExamCell | `GET /api/exam-cell/audit-log` |

---

## RBAC smoke tests (expected 403)

| Actor | Endpoint | Expected |
|-------|----------|----------|
| ExamOperator | `POST /api/exam-cell/results/publish` | 403 |
| ExamOperator | `POST /api/exam-cell/ufm-cases` | 403 |
| ExamAdmin | `POST /api/exam-cell/result-control/sessions/:id/declare` | 403 |
| ExamAdmin | `POST /api/exam-cell/result-control/sessions/:id/lock-marks` | 403 |

Run automated checks: `cd tests && npm run test:integration`

---

## Related modules (not exhaustive)

| Prefix | Module | Primary roles |
|--------|--------|---------------|
| `/api/student` | student-portal | Student |
| `/hr`, `/api/hr` | hr | HR, Faculty, HOD, Dean |
| `/api/helpdesk/tickets` | helpdesk | All (feature-gated) |
| `/iam` | iam | SuperAdmin, Registrar |
| `/api/super-admin` | super-admin | SuperAdmin |

See [SYSTEM_MAP.md](./SYSTEM_MAP.md) for the complete module → role matrix.

---

*Generated from controller grep on `academics.controller.ts`, `exam-cell.controller.ts`, `auth.controller.ts`, and `dean-intelligence.controller.ts`.*
