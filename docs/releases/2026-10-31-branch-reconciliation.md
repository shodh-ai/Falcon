# Finance, HR and examination reconciliation — 31 October 2026

Base: main 2f44f4c7a4918ba64b2d5f05adb1d56501b03048.
Reviewed source heads: fin-fix 3d7c28aa, hr-fix 56c618b9, exam-portal 80eb021e29408b06d4fd5438f7e251d0d612f77a.

These branches are stacked, not independent. Directly merging all their old snapshots would revert newer production requirements. This release selectively reconciles their intent.

| Source | Disposition |
| --- | --- |
| fin-fix / PR190 | Compatible tenant enforcement, error states, funding-source clarity and Policy Vault access already merged in PR191. Preserve current scoped budget safeguards and multi-day OD. |
| hr-fix / PR196 | Compatible workforce/team/controller and attendance hardening already merged in PR197 (b39d1155). Preserve flexible department reporting approvals; do not reinstate mandatory HR final approval. |
| exam-portal / PR187 | Add question-paper versions and immutable uploads, protected downloads, exam-day attendance/script receipt/discrepancy/UFM tracking, and explicit unknown degree-clearance state with atomic Registrar decisions. |
| Older examination replacements | Retain current end-semester HOD/Exam Cell approval and release, hall-ticket exemptions and issuance, scoped transcripts, backlog and current registrations. The source branch's disabled hall-ticket paths and conflicting replacement workflows are not imported. |

Integration fixes: choose an authorized role across multi-role users; retain date-only exam serialization; use create-only file storage; deny generic downloads of private question papers; isolate optional clearance SQL failures with savepoints; align Registrar locking order to avoid concurrent-decision deadlocks.

Degree audits intentionally remain pending when requirements or authoritative clearance data cannot be verified. This release does not invent eligibility policy or automatically approve degrees.

## Release safety

Apply only the three new reviewed examination migrations before replacing the backend. They add schema and preserve existing records; legacy receipt/clearance facts are not fabricated. Confirm runtime access to the two new tables. Keep previous image tags for rollback; additive schema remains compatible with the previous image.

Build frontend and backend locally, run regression and isolated PostgreSQL integration tests, then build immutable Linux images away from production. Deploy sequentially with health checks. No student, enrollment, mark, fee, attendance or timetable data repair is part of this release.
