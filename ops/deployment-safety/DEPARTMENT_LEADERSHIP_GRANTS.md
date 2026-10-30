# Department leadership: protected schema and runtime grants

This is release preparation. These files do not apply a migration, change a live
role, restart an application or activate a department.

The ten limited leadership and HR route tables have exact runtime permissions. Existing tables retain
their reviewed business CRUD, sequence, migration-ledger and reporting-view
boundaries. The API remains a non-owner role without DDL, elevated membership or
privilege delegation. No credential, storage policy, mount or upload ACL changes
are required.

| Table | Runtime SELECT | Runtime INSERT | Runtime UPDATE columns |
| --- | --- | --- | --- |
| `department_leadership` | Yes | Yes | `structure`, `higher_officer_id`, `revision` |
| `department_offices` | Yes | Yes | `login_alias` |
| `department_office_appointments` | Yes | Yes | `valid_to` |
| `department_office_session_revisions` | Yes | Yes | `revision` |
| `department_leadership_events` | Yes | Yes | None |
| `student_identity_email_changes` | Yes | No | None |
| `hr_department_request_routes` | Yes | Yes | `approver_ids`, `current_index`, `leadership_revision`, `updated_at` |
| `department_leadership_changes` | Yes | Yes | None |
| `hr_staff_request_appeals` | Yes | Yes | `rejecting_user_id`, `reviewer_user_id`, `status`, `reconsideration_count`, `revision`, `updated_at` |
| `hr_staff_request_appeal_events` | Yes | Yes | None |

The `department_leadership` UPDATE list also includes `dean_enabled` and
`dean_user_id` for the flexible editor.

No table-level UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN or grant option
is permitted on these ten tables. Runtime INSERT/UPDATE on the email ledger is
unnecessary: the explicit email-mapping maintenance operation uses separately
reviewed maintenance authority. The API can append audit events and end an
appointment through `valid_to`; it cannot rewrite an event or appointment identity.
An owner can still change these objects. This is a runtime-role boundary, not
protection from host root or the database owner.

Both the full role policy and startup verification must agree on the named
exceptions. Effective permissions include PUBLIC, inherited and column-level
grants. Missing required permissions and additional forbidden permissions must
fail closed. Unknown ordinary application tables retain the existing CRUD rule.
Absence of the ten tables is accepted by the protection check so the compatibility
image can start before this additive migration.

## Required release order

The previous startup guard requires CRUD on every ordinary public table. Applying
the new tables with narrow permissions before replacing that guard can leave a
currently healthy process unable to restart. Do not leave that recovery gap.

1. Build a compatibility backend image from the **currently deployed application
   revision plus only this protection change**. Do not deploy the full leadership
   application code against an absent schema. Run full CI and isolated PostgreSQL
   18 acceptance with the old schema. Prove the compatibility image's startup and
   existing critical workflows before rolling it out. Retain its immutable digest
   as the compatible rollback image.
2. Recheck the live revision, exact persistent mounts, protected policy, healthy
   containers, fresh backup integrity and resource headroom. Synchronize the owner
   migration/grant operation with the application release. Retain the healthy
   compatibility container throughout.
3. Use the final immutable candidate image in the separate one-off deployment job:
   `node scripts/deploy-migrate.js`, with no arguments and explicit
   `NODE_ENV=production`. Provide server-private `MIGRATION_DB_*` and an exact
   `PRODUCTION_MIGRATION_MANIFEST` only to this job. Review **every** pending filename
   and hash. Use reviewed bounded lock/statement timeouts; do not use API credentials,
   seed, repair, force, replay or bootstrap modes. The migration must not contain an
   inner transaction commit: the runner owns SQL plus ledger atomicity.
4. Apply the separately reviewed **ten-table grant delta**, preserving unrelated
   grants. Do not run the fresh-role provisioner against existing `falcon_runtime`.
   The full `runtime-role.sql` policy also retains these exceptions for future
   reviewed regrants; do not substitute a broad automatic regrant for the scoped
   operation. Confirm required objects/columns exist and are the expected kind,
   ownership and shape before granting. The grant helper validates the ten ordinary
   table names and allowed UPDATE columns; it is not a complete migration-shape
   validator. Separately compare every column/type/default, index and foreign key
   with the reviewed migration. Keep credentials private.
5. Using an actual runtime login, prove startup-boundary acceptance, required
   leadership reads/writes, audit append and forbidden mutation denial. Prove the
   compatibility image can restart and roll back with the new schema/grants.
   Reconcile the schema and migration ledger before retrying an ambiguous job.
6. Only then promote the matching leadership backend/frontend immutable images,
   with the same persistent mounts and separately verified health/read paths.
   Insufficient headroom stops rollout; do not remove the healthy container first.

The migration and grant transactions are separate. During their short gap an
unexpected restart can still fail closed for missing required access. Isolated
acceptance must demonstrate the controlled sequence and an owner recovery path;
do not describe the gap as atomic or risk-free. No API restart or independent
deployment is allowed during it.

Leadership activation, Principal authority expansion, student email mapping,
mailbox provisioning, HR decisions and credential documents are separate opt-in
operations. This grant preparation authorizes none of them.

## Acceptance evidence

Run the Node runtime-launcher tests and the opt-in real PostgreSQL 18 role fixture.
The fixture must cover old schema acceptance, exact table/column grants, policy
reapplication, direct and PUBLIC/inherited/column privilege denial, append-only
audit behavior, read-only API email ledger, unchanged ordinary business CRUD and
the actual exported startup query. Generated fixtures must use their own isolated
storage and identities; no production credentials, data, mounts or published ports.

Record an unavailable or skipped PG18 fixture as **unproven**, including its concrete
execution blocker. Mock tests or a different PostgreSQL major do not establish the
PG18 production acceptance gate.

On 29 October 2026, the prior six-table role fixture completed all **19 tests with no
failures or skips** in a disposable, disconnected PostgreSQL 18 container. It used
synthetic relations and roles, and the real exported startup query. The API,
frontend, PostgreSQL and Redis production identities, images, mounts, start times
and restart counts were unchanged, with health checks passing afterward. The
test containers were removed. The 22 Node launcher/deployment tests and local
197-test Python suite also passed; the latter skips its opt-in container class
locally, which was exercised separately by the 19-test server run.

That evidence established the prior six-table grant/metadata-query behavior against
synthetic PG18 data. The expanded ten-table fixture passed in the PR #193 CI
storage and database deployment-boundaries job on 30 October 2026, using a
disposable PostgreSQL 18 container and synthetic data. This establishes the
isolated grant-policy gate only.
It does not establish final-image startup, password-authenticated production login,
business workflow acceptance, the complete leadership migration shape, or the
compatibility-image rolling deployment/restart/rollback sequence. Those remain
required release gates above.
