# Principal workspace: responsibility boundaries and release checks

## Authority

The Principal workspace is a department-scoped oversight surface. An active office appointment is required on every request; a stale role claim is insufficient. Principal is not an alias for HOD, HR, Finance, IQAC, COE or institutional leadership.

| Work | Routine owner | Principal involvement |
| --- | --- | --- |
| Timetable reschedule/swap/reshuffle | Existing HOD academic decision path | HOD may explicitly escalate a pending, same-department request with a recommendation. Principal decides that reserved case. Mandatory source validation still applies. |
| Extra classes, proxy cover, profile corrections | Existing HOD/domain authority | Read-only oversight/follow-up. No new direct mutation or override permission. |
| New reporting-manager/dept-head stages | HOD in HOD-only / Principal+HOD; Principal in Principal-only | HOD's own requests go to Principal when both exist. Principal's own requests require an explicitly configured higher officer. |
| Existing pending reporting requests | Their recorded approver | No automatic reassignment. |
| Gate passes | Operational reporting approver, then independent HR review | Previously assigned or explicitly reserved reporting work only; no final HR authority. |
| Events / venues | Existing coordinator and venue-specific authority | No automatic Principal stage or inheritance. |
| Grades / published results | Existing faculty/COE rules | Counts of published coursework records only; no student marks or held examination results. |
| IQAC submissions | Faculty → HOD → IQAC | Department submission-status counts and follow-up only. |
| Workload / recurring timetable | HOD manages; canonical academic records | Read-only projections, exact minutes, held sessions distinguished from zero load. |

Additional policy-reserved request types require their own reviewed domain adapter and explicit delegation. This release does not invent university thresholds or add a generic override button. The supported reserved academic adapter is timetable changes; existing explicit specialist workflow assignments retain their authority.

## Navigation

All Principal sidebar, mobile and command links remain under `/principal`. The legacy Principal DoFA URL redirects to the scoped Approval Centre, rather than opening the universal role-wide inbox. Faculty and student directory views remain in the Principal shell. Personal profile/settings routes exist. A Principal visiting another authorized workspace gets an explicit return link.

HOD sees the new escalation/follow-up entry only when assigned an active HOD office in a Principal+HOD department. Other departments retain their existing navigation and approval structure.

## Canonical records and state

Oversight cases use append-only `department_leadership_events` entries with action `PRINCIPAL_CASE`. Each event carries a stable case ID, revision, human actor, active office, command key and fingerprint. There is no second academic request store. A timetable case's source is its existing `academic_class_moves.change_group_id`.

- Routine HOD decision: original pending source → validated canonical approval/rejection.
- Reserved case: pending HOD source → HOD escalation → pending Principal → approval evidence → canonical application → applied, or application failed.
- Returning a case releases the source to HOD. Resubmission uses the same case history.
- Failed application rolls back source writes to a savepoint and retains approval/failure evidence. Retry rechecks roster, dates, attendance, faculty leave, faculty/room/student clashes, department scope and current office.
- Retry retains the approved decision direction, including rejection. A successful replay does not repeat application or notifications.
- Follow-up: Principal assigns → pending HOD → HOD response → pending Principal → closed or returned.
- Decisions require `If-Match` and `Idempotency-Key`. Concurrent source decisions/escalations and case transitions use transaction-scoped advisory locks and source row locks.

The same canonical approved class-move rows already used by Faculty/Student timetable and attendance readers are updated. No recurring timetable rows, historical attendance, roster memberships, passwords or profile records are reassigned.

## Release

No new schema, ACL, account or appointment migration is required. Existing API SELECT permissions and INSERT/SELECT on the leadership event log are sufficient. The API remains a non-owner runtime role.

1. Clean off-server backend build; clean frontend build with `FALCON_CLEAN_BUILD=1` (disables webpack disk cache only).
2. Backend/frontend regression suites, plus `node backend/scripts/principal-oversight.integration.js` against disposable local PostgreSQL. In CI use PGHOST/PGUSER/PGPASSWORD for its disposable service; it creates and removes its own database.
3. Publish immutable Linux images through GitHub. Review and merge under normal branch protection.
4. Record currently running images, deploy backend image first, verify health and scoped Principal read models, then deploy frontend. Coolify must pull images, never compile on VPS.
5. Verify live Principal/HOD office scope, navigation, oversight projections and application health. Do not create fictional production requests to test mutations.
6. For immediate rollback before adoption, restore both prior immutable images. If any new reserved cases exist, do not roll backend code back blindly: keep decision endpoints paused and review/return those cases first, because old code does not enforce their reservations. Audit events are append-only and must remain.

## Verification evidence

The disposable SQL test exercises ordinary HOD application, reserved approval/rejection, validation failure and rollback, successful retry/replay, follow-up return/response/closure, concurrent decisions, self-recommendation rejection, cross-tenant/department denial, office revocation and read-model SQL. UI tests cover scoped links, return navigation, exact duration formatting, pending-owner counts, errors, versioned/idempotent decision submission and successful refresh. Existing workflow regression suites cover the untouched specialist controls. Interactive production sign-in remains a separate acceptance check; passing service/fixture tests must not be described as that sign-in check.
