# Pharmacy workforce and attendance release

## Behavior

- Three finally approved regularizations per employee per submission calendar month, and a separate allowance of three finally approved leave reconsiderations. Pending, rejected and HOD-only approvals do not consume allowances. India time defines the month. Final approval transactions serialize by employee, including administrative overrides. The existing one-reconsideration-cycle-per-request rule stays.
- New regularizations go to an independent active department HOD, then an independent HR reviewer with department/entity access. No automatic Principal/Dean detour. Missing officers block submission with an explanation. Existing requests keep their recorded path. Leadership changes preserve this special policy when rerouting pending requests. Other HR request types retain their configured chain.
- Pharmacy display labels use **Gyan Vihar School of Pharmacy** in SGVU API-backed screens; Pharmacy HOD header uses **HOD Pharma**. Actor names, stored department IDs and audit records are retained.
- Department duty cards distinguish saved assignment, unassigned, saving and unsaved change. These describe assignment state, not invented task completion.
- Approval screens show Raised on timestamps. New gate passes and appraisal submissions acquire timestamps; historical unknown times remain “Not recorded”. Request attachments are explained as supporting evidence; Document Approvals verify the HR document vault. Timetable Change explains dated class changes.
- Student Monitor has explicit loading, error/retry and empty states, current course rows and readable semester history. Empty HOD department scope cannot expose a student's record.

## Locked attendance

Faculty request reopening from the locked class attendance screen. HOD → Attendance Reopening lists the scoped requests, reasons, status and Raised on time. Only the active department HOD may decide; self-approval is rejected. Approval opens exactly the requested teacher/course/session/date for 24 hours. Normal roster, substitution, cancellation, scope and complete-sheet validations still apply. Permission is checked again during the save transaction and before/after corrections are audited.

## Events

Faculty → Mark Event Attendance allows a teacher to select a fully approved event and their exact dated class. The event's assigned faculty adviser is the coordinator. The verified full class roster and session are snapshotted for HOD review. No guessed students or automatic attendance credits.

HOD → Event Class Approvals revalidates event approval, coordinator, class and roster under transaction locks before approval. Changed data requires rejection and a fresh request. Only approved event AND approved cohort create an exemption. Faculty/student timetables identify the event; ordinary attendance writes for that class are blocked. Workload still includes the class and reports event-exempted hours separately.

The approved coordinator marks Present/Absent for every cohort member in the dedicated page, on the event date or within three days. The audited transaction updates one provenance-linked course attendance log and recalculates the course attendance percentage. Revision checks prevent stale overwrites. No unmarked student is treated as present. Revoked event approval stops coordinator writes. Existing class attendance prevents a new exemption, and approved exemptions block subsequent swaps, substitutions or cancellations until the arrangement is resolved.

This release supports exact recurring dated classes, not already moved/substituted/cancelled sessions or partial-class cohorts. No recurring timetable is changed by the event workflow.

## Gate verification

`/gate-pass-check` is available to active Security accounts and Super Admin. Security is limited to assigned campuses. Only fully approved, non-archived staff passes appear; dates and current validity are displayed. Match the university ID before allowing exit. Verification clears after 60 seconds and requires refresh. The screen cannot approve passes or extend their validity.

## Deployment

Apply expand-only migrations before switching backend/frontend images:

1. `20261031150000_workforce_regularization_policy.sql`
2. `20261031151000_attendance_reopening.sql`
3. `20261031152000_event_class_cohorts.sql`
4. `20261031153000_request_raised_timestamps.sql`

These migrations do not delete or reset students, enrollment, marks, academic timetables or historic HR decisions. On an installation using restricted `falcon_runtime`, verify SELECT/INSERT/UPDATE on the new request/cohort tables and SELECT/INSERT on their append-only audit tables. No broader role grants are needed. Existing course-attendance permissions cover the new nullable provenance column. UUID IDs need no sequence grants.

The separately merged examination release PR #203 also has three migrations; inspect the production migration ledger for all outstanding migrations, never infer from the container tag alone.

Build backend and frontend locally, run tests, publish images off the production host, then have Coolify pull immutable image tags. Do not start a build on the production VPS. Verify running image labels and health after rollout. Do not use real students as smoke fixtures.

## Verification

- Clean local backend TypeScript build and frontend Next.js production build passed (692 generated pages/routes).
- Full frontend suite including event UI and student exemption tests: 156 files / 1,021 tests passed.
- Backend HR/academics/leadership/module-control regression: 78 suites / 583 tests passed, 26 tests intentionally skipped without dedicated integration configuration.
- Local disposable PostgreSQL: monthly quota tests (5), event/reopening/gate/routing/timestamp tests (11) passed, including last-slot concurrency, actual SQL, scope denials, revision checks and audited event attendance correction.
- Weekly workload tests include retained credit for event-exempted classes.
- Production rollout is not yet verified: browser control reports “Local browser use is disabled in Work settings”, preventing Coolify migration/deployment access.

## Manual pilot (QA-only accounts)

1. Submit regularization: verify HOD queue, approve, verify only assigned HR final queue, then final approve. Check a fourth approved request in the same month is rejected; pending/rejected requests do not count.
2. Request reopening for an old locked QA class; HOD approves with a reason. Save a complete corrected roster; verify audit and expiration. A different class/date/user must remain locked.
3. Fully approve a QA event. Request a class exemption with an existing QA roster. Before HOD approval nothing changes. After approval check faculty/student labels, unchanged workload and dedicated coordinator access. Mark each student, save, reload and check percentages. Test a stale second tab.
4. Security checks a QA staff gate pass before and after final approval, outside its valid time and from another campus. Only authorized current approval should be usable.
5. Check Pharmacy HOD header, saved/unsaved duty colors, Raised on and Student Monitor navigation/error recovery without modifying real records.

## Runtime compatibility follow-up

The guarded launcher must recognize the six new examination/attendance tables before deploying this schema. Its exact permission matrix now grants immutable question-paper versions and correction/event audit tables SELECT/INSERT only, and permits updates only to decision/attendance columns on request/cohort/discrepancy tables. Neither table DELETE nor identity-column UPDATE is required. Apply the reviewed scoped grants together with the migrations; do not restart a legacy launcher after creating these restricted tables. The previous running process remains healthy during the additive migration.
