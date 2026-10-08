# Falcon Campus OS — Dean Portal Audit

Audit date: 2026-10-05
Repository: `/Users/apple/Desktop/Falcon/Falcon`
Scope: existing Dean Portal code, tests, running local services, and discoverable API/controller/service/database paths.

## Evidence rules

A passing HTTP response was not treated as proof of a completed workflow. Results are separated into verified code/test evidence, environment limitations, test/data gaps, and unconfirmed behavior. No business logic was changed during this audit.

## Portal structure

The Dean layout is `frontend/src/app/(portals)/dean/layout.tsx`. It applies `RoleGate`, `PortalOnboardingGuard`, and `GenericPortalShell portal="dean"`. The dashboard page delegates to `DeanCommandCenter`. Frontend route authorization maps the primary `/dean` portal to the `dean` role; selected shared portals also allow Dean access.

## Discovered pages

41 `page.tsx` routes were found: academics/BOS, course allocation, result analytics, syllabus tracking, timetable, analytics, DOFA approvals and inbox, attendance and attendance policy, audit log, budget, dashboard, departments and department detail, events, faculty appraisals/leaderboard/workload, inbox, self-service payslips/policies/tickets, meetings and meeting analytics, notifications, onboarding steps 1–3, PhD approvals, procurement requisitions, profile, reports, research, safety concerns, search, settings, student grievances and monitor.

## Main page-to-service mapping

| Page/capability | API/controller | Service/data evidence | Related module |
|---|---|---|---|
| Dashboard/command center | `GET /api/academics/dean/command-center`, intelligence dashboard | `academics.controller.ts`, `dean-intelligence.service.ts` | departments, workload, approvals, notifications |
| Departments/workload/timetable | `/api/academics/dean/departments`, `/faculty-workload`, `/timetable` | academics service queries | departments, faculty, timetable |
| Course/syllabus/results | `/course-allocation`, `/syllabus-coverage`, `/result-analytics` | academics service | curriculum, examination |
| Student monitor/grievances | `/students`, `/student-monitor/:studentId/detail`, `/slow-learners`, `/grievances`; grievance resolve POST | academics service; audit metadata on resolve | students, tickets |
| Dean inbox/result approvals | `/inbox`; intelligence `/result-approvals` and decision POST | `dean-intelligence.service.ts` | examination/result workflow |
| Analytics/budget/research/placement/meetings | intelligence dashboard APIs | `dean-intelligence.service.ts` | finance, research, placement, meetings |
| Notifications/audit/search | intelligence notifications, audit-log, search APIs | `falcon_notifications`, `system_audit_logs` and joined users/departments | notifications, audit |
| Attendance policy | `/api/attendance-policy/dean/threshold-requests` and decision | attendance-policy controller/service | attendance |
| PhD approvals | `/api/phd-lifecycle/dean/...` | PhD lifecycle controller/service | research/PhD |
| Safety concerns | `/api/student-safety/dean/concerns...` | student-safety controller/service | student safety |
| Events/meetings/procurement/self-service | module-specific controllers and shared HR/self-service APIs | static route imports and shared portal shell | campus events, meetings, procurement, HR |

## Authorization

The principal Dean controllers use `JwtAuthGuard` and `RolesGuard` and require `Dean` or `SuperAdmin`. Frontend route gating alone is not relied on for API authorization.

## Database tables observed in Dean intelligence code

`system_audit_logs`, `users`, `departments`, `fin_dept_budgets`, `fin_program_budgets`, `faculty_research_projects`, `faculty_research_logs`, `portal_meetings`, `portal_meeting_participants`, `portal_meeting_minutes`, `falcon_notifications`, and `exam_result_dean_approval_requests`, plus academic/student/event tables referenced by the underlying services.

## Architecture risks/gaps

- The route registry used by E2E tests covers only 10 named Dean routes, while 41 page routes exist.
- Existing API integration tests use a mock gateway; they do not prove live DB writes, notification creation, audit rows, or destination-module status.
- Shared navigation exposes additional HR/self-service and cross-module routes whose API behavior is outside the Dean-specific integration suite.
