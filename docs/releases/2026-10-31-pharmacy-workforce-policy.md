# Pharmacy workforce and attendance changes

## Confirmed policy

- Each employee may have three finally approved regularizations per calendar month. Pending, HOD-only and rejected requests do not consume the allowance.
- Each employee may have three finally approved leave reconsiderations per calendar month. An ordinary leave approval does not consume this separate allowance. The existing single reconsideration cycle per rejected request remains in place.
- Use the request submission month (appeal submission month for reconsiderations), in Asia/Kolkata. Check inside the final approval transaction, including concurrent requests and administrative overrides. Repeated idempotent decisions do not consume another slot.
- Regularization must follow HOD then HR. Other configured reporting chains remain unchanged.
- An event may exempt classes and transfer event attendance access only after approval of both the event and the intended student cohort. Draft and pending events must not alter attendance, schedules or permissions.
- Approved event exemptions remain visible in faculty/student schedules, retain teaching workload credit and identify the source event. Only the assigned faculty coordinator may mark attendance for the approved event cohort.
- Preserve all official Pharmacy students, enrollments, marks, timetables and audit history.

## Requested interface/workflow follow-through

- Use “Gyan Vihar School of Pharmacy” for Pharmacy display names and “HOD Pharma” in the Pharmacy HOD workspace header. Retain the actual actor in records and audit details.
- Colour and label department-duty statuses; show when each approval request was raised.
- Explain supporting documents versus employee-document verification. Explain the timetable-change approval queue.
- Add faculty requests for HOD-authorized reopening of locked class attendance.
- Provide a scoped guard view of approved, currently valid gate passes.
- Improve the Student Monitor detail view, including explicit loading/error/empty states and readable academic history.

## Implementation checkpoint

Implemented locally: monthly final-approval limits, using a transaction-scoped per-employee lock and existing request/appeal records; no data migration or historical reset.

Validation: five isolated PostgreSQL tests cover approved-only counting, separate limits, tenant/employee boundaries, India calendar boundaries and competing final approvals. HR regression suites and the clean backend build also pass. The PostgreSQL suite is added to CI.

The HOD → HR routing exception, event/cohort workflow, gate-pass view and interface follow-through above are still pending implementation. This document is not a production completion claim.
