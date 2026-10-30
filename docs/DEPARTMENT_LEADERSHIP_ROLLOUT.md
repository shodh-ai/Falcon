# Department leadership and Pharmacy identity rollout

## Current release boundary

This change is opt-in. The expand-only schema does **not** activate any department,
change a password, provision a mailbox, change a student enrollment or approve HR.
Office aliases are case-insensitive local-password login aliases for the current
named officeholder, not independent shared identities or actual mailboxes.

Officeholder changes append appointment history and audit events, increment the
old and new holders' authentication revisions, and project the reporting head to
staff records. Existing personal requests keep their recorded approvers. HOD
academic review stages remain HOD stages; Principal has scoped academic oversight
and direct reporting-manager/department-head HR stages, not unrestricted teaching
or specialist HR/Finance/IQAC authority. Completed decisions are not rewritten.

Legacy HOD-to-Dean auto-generation is suppressed for managed departments. A legacy
primary HOD's inferred secondary Dean role is excluded from effective claims unless
an independent school/Dean hierarchy appointment exists. Before activation, verify
that any manually assigned secondary Dean roles have explicit appointment records;
do not strip an independently approved appointment based solely on this heuristic.

## Administrative API

- `GET /api/campus-admin/department-leadership/:deptId`
- `PUT /api/campus-admin/department-leadership/:deptId` with `If-Match: <revision>`
  and `{structure, higher_officer_id}`. Revision `0` means not previously configured.
- `POST /api/campus-admin/department-leadership/:deptId/appointments` with the
  current `If-Match` and `{kind, login_alias, user_id}`. Explicit `null` ends a
  holder's appointment; an omitted user_id is an error.
- `GET /api/academics/principal/overview` checks a live Principal appointment and
  returns only the assigned department's staff, students and active courses.

Campus and Super Admin hierarchy screens expose the editor. Appointments take
effect immediately and retain actual valid_from/valid_to timestamps. Future-dated
appointment scheduling is not exposed. Legacy HOD mutation endpoints refuse changes
for managed departments; use the revision-controlled editor instead.

The higher reporting officer must be active staff in the same tenant outside the
managed department. Their existing reporting chain must not loop through the
department. Vacant reporting offices and the head's missing higher officer block
new reporting requests with a clear 400; neither HOD nor HR is silently substituted.

## Verification

From backend: `npm run build`; `npm test -- --runInBand`;
`node scripts/department-leadership.integration.js`;
`node --test scripts/pharmacy-student-email-mapping.spec.js`.

The integration uses and drops only its own synthetic local PostgreSQL database.
It tests all three structures, alias tenant isolation, end/replacement of holders,
revision checks, preserved password hashes and 151-email preview/apply/replay.
Production smoke tests must additionally cover real account login, HR transitions,
first-login/recovery gating, unrelated departments and refresh persistence.

## Deployment gate (mandatory)

The current main branch runs a non-owner runtime database role and UID 61001 with
read-only application code. Do **not** run DDL from its API terminal, inject migration
credentials into the API, change upload ACLs or weaken runtime-start checks.

1. Build/test immutable backend and frontend images off-server. Local frontend
   build hit disk exhaustion; a successful compiler phase is not a full build pass.
   Require the cloud clean build, image build and complete CI before promotion.
2. Retain a current verified database/upload backup. Use the existing separately
   credentialed deployment job (`node scripts/deploy-migrate.js`) to apply the new
   schema. Review **all** pending migrations before invoking its runner.
3. The deployment owner must apply/review the existing runtime-role grant procedure
   for the new tables, without granting DDL, ownership, schema CREATE, elevated
   roles or migration-ledger writes. Re-run the protected runtime boundary checks.
4. Deploy backend, then frontend from matching immutable images, retaining the
   previous image digests. Schema activation remains separate.
5. Run `node scripts/activate-pharmacy-leadership.js --actor <admin-user-uuid>` for
   read-only preview. It verifies SGVU/Pharmacy43, Manish/5359 and Hitesh/5091.
6. At action time obtain confirmation for Principal access/reporting expansion.
   Then add `--apply --backup-dir <new-private-persistent-directory>`; optionally
   pass the confirmed `--higher-officer <uuid>`. Without it, Principal self-requests
   remain blocked. A matching repeat invocation is a no-op; conflicting existing
   leadership refuses automated replacement. Do not put private backups in uploads.
7. Preview student mapping with `node scripts/pharmacy-student-email-mapping.js
   --output <new-private-preview.json>`. Review exact cohort and exclusions. Then
   run with `--apply --output <new-private-committed-report.json>` after backup.
   No password is output/reset. Prior email addresses remain in a dedicated ledger;
   recovery delivery stays disabled until mailbox provisioning is confirmed.
8. Render the revised PDF from the committed report only, using
   `python scripts/render-pharmacy-student-credentials.py <report> <private.pdf>`.
   Run the PDF skill authoring marker before rendering; reconcile rows and visually
   inspect every rendered page before giving it to the user. No original secure
   credential artifact was located, so list current-password instructions, not
   guessed or stale plaintext passwords.

## Rollback and non-goals

Retain the private before.json snapshot and original student email ledger. Rollback
requires a reviewed delta restoration of reporting officers, HOD pointer and emails,
not wholesale user-row restoration over newer submissions. End new appointments,
invalidate affected sessions monotonically, preserve all events, and restore the
previous images. Do not drop tables, rerun old Pharmacy migrations, reset passwords,
remap historical attendance, infer practical batches or alter unresolved timetable
conflicts. No production mutation or PDF distribution is implied by a green build.
