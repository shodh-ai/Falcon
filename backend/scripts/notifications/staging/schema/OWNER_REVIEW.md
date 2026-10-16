# Notification staging schema — owner procedure and local evidence

Initial preparation executed no SQL. Under separate explicit local approval on
**16 October 2026**, owner role preparation, the base schema, runtime grants and
four synthetic records were created and verified only in the dedicated database.
The concurrent outbox index passed pre/postflight and PostgreSQL `EXPLAIN` showed
its index path. These are actual local results; no hosted/production schema was
accessed. Offline tests remain distinct from PostgreSQL runtime evidence.
This is a NEW minimal component-test schema, not a migration of existing data.

## Target and separate responsibilities

- Only `falcon-notification-staging-postgres` → `172.30.71.2:5432`, PostgreSQL 16,
  database `falcon_notification_staging`, schema `public`.
- New cluster/volume/container identity and blocked external/host-service access
  must be verified independently by the hosting owner before any connection.
- Administrative provisioning, base creation, runtime grants, synthetic fixtures,
  and the concurrent outbox index are five separate reviewed operations.
- `roles.review.sql` is MANUAL admin SQL and is deliberately NOT mounted or
  allowlisted by the Node bootstrap. It requires the new bootstrap principal,
  an empty dedicated database, no other application database, and no existing
  owner/app role. It refuses shared or populated targets. It creates roles with
  `PASSWORD NULL`, no elevated attributes, no memberships and `NOINHERIT`.
- Administrator must supply NEW owner/app credentials privately using the secret
  store/interactive administrative mechanism. Never put passwords in SQL, shell
  arguments/history, Git, chat, logs, fixture source or either checkout's `.env`.
- Owner becomes the database/public-schema owner; PUBLIC database/schema access
  is removed. Runtime has no database CREATE/TEMP, schema CREATE, ownership,
  elevated attributes, memberships, default grants or grant options.
- The admin operation sets the positive database comment
  `falcon-notification-staging:approved-empty-v1`. Base bootstrap verifies this
  independently of the later owner-owned `notification_staging_environment` row.

## Exact phase order

1. Independently inspect target container, dedicated new volume, network/IP and
   PostgreSQL version; review role SQL and obtain separate admin approval.
2. Execute reviewed admin role preparation separately, then privately provision
   new credentials. Verify role attributes, ownership, PUBLIC/default ACLs and
   authentication policy. Do not weaken HBA or use trust authentication.
3. Inspect `base.review.sql`, `catalog.review.json`, hashes and current entities.
   Explicit base execution uses restricted owner, requires a completely empty
   public/application catalog, and creates only the 16 allowlisted tables,
   5 owner-only serial sequences, declared constraints and 34 base indexes.
   Its sole INSERT is the technical environment marker, not an account fixture.
4. Runtime grant execution is separate. It requires exact base catalog and zero
   pre-existing effective runtime access, then grants only the policy below.
5. Fixture insertion is separate, requires exact base catalog/privileges and
   completely empty application tables except the marker. It creates only
   one tenant, one Faculty role, one synthetic user and its primary role mapping.
6. Only AFTER grants and fixtures, apply the separately reviewed outbox index
   through its autocommit owner procedure. Never run the concurrent index inside
   the bootstrap transaction. Its extra catalog entry intentionally makes a
   later base/grants/fixture rebaseline fail closed.
7. Verify PostgreSQL definitions, constraints, ownership and effective grants,
   then verify runtime login, queue/worker and Mailpit under separate approval.

Base and grants each use one runner-owned transaction. Every DDL/GRANT or fixture
INSERT rechecks exact server/database/schema/owner, DNS and role safety. Runner
serialization uses a transaction advisory lock. Errors roll back and stop; there
is no reset, DROP, DELETE, truncate, repair, historical migration sweep, schema
synchronization or retry/replay path. Roles/admin SQL owns its separate transaction.
Failed fixture transactions may advance this NEW database's serial sequence;
never reset sequence values to conceal an attempted run.

## Model and query choices

Nine entity-backed tables are checked offline against actual TypeORM metadata:
Tenant, TenantSubscription, Role, Campus, School, Department, User, UserRole and
FalconNotification. Entity timestamp-without-time-zone fields remain `timestamp`;
notification/soft-delete timestamps use `timestamptz`. Nullable school/dept/HOD
relationships and their delete policies match actual models. A model's duplicate
unique decorator/index is represented by one equivalent unique constraint.

The current User entity declares BOTH globally unique `official_email` and the
tenant/email uniqueness rule. This preparation preserves both in the NEW schema;
it neither repairs nor adds a constraint to any existing database.

Raw authentication helper tables are a documented minimal query-compatible
selection from existing HR/login migrations. Historical HR migrations have
alternative fallback shapes. This schema includes the columns needed by the
actual profile/authentication reads, not the unrelated HR CRUD workflows. It
includes the original permission UUID and tenant/user uniqueness, and the later
login-critical HR timestamp/module fields. Optional organization contact fields
and unrelated HR/task/compliance, storage, OAuth, student/parent and recovery-token
tables are excluded. `users.onboarding_profile`/`last_login_at` are explicit raw
auth additions. Reporting/entity/tenant FKs preserve supported relationships;
owner review must not treat this as full production-schema equivalence.

## Runtime least privilege

- Lookup/configuration/marker tables: SELECT only.
- Users: SELECT; UPDATE only `last_login_at`, `account_status`, `updated_at`.
  No INSERT, password/tenant/role/name update or DELETE.
- User roles: SELECT/INSERT and UPDATE only `is_primary`, `deleted_at`, required
  by existing role mapping; no role creation or mapping deletion.
- Notifications: SELECT/INSERT; UPDATE only metadata/read/read-at/deleted-at.
  No notification identity, account association, content/link updates or DELETE.
- Login/audit history: column-scoped INSERT only; no runtime SELECT/UPDATE/DELETE.
  Owner/operator independently checks these records after acceptance.
- No sequence, ownership, DDL, grant option, REFERENCES, TRIGGER or destructive
  privileges. Effective privileges inherited through PUBLIC are checked too.
  This is capability isolation, not SQL row-level security. Backend tenant and
  account checks remain essential. There are no real users in this database.

## Private owner configuration and reviewed commands

Use a NEW private owner config, separate from runtime config, with names only:

```text
NODE_ENV
FALCON_NOTIFICATION_STAGING
NOTIFICATION_STAGING_SCHEMA_HOST
NOTIFICATION_STAGING_SCHEMA_PORT
NOTIFICATION_STAGING_SCHEMA_DATABASE
NOTIFICATION_STAGING_SCHEMA_USER
NOTIFICATION_STAGING_SCHEMA_PASSWORD
NOTIFICATION_STAGING_SCHEMA_WRITE_APPROVAL
NOTIFICATION_STAGING_FIXTURE_APPROVAL
```

Fixed values: production mode, approved staging guard, the target above, user
`notification_staging_owner`. Execution approval literals are
`approved-new-notification-staging-only` and (fixtures only)
`approved-synthetic-only`. A flag does not itself grant authorization. Neither
`DB_*`/`PG*` credentials nor runtime app credentials are accepted by the owner runner.

`runner.review.yml` is disabled by default and uses the already reviewed Linux
artifact dependencies, with only exact reviewed files mounted read-only. It has
no ports, Docker socket, external network, role SQL or migration directory. Use
`--env-file /dev/null` for future Compose commands and verify actual mounts.
Do not mount the macOS dependency symlink in Linux.

Reviewed commands executed under the separate 16 October local approval. Do not
rerun them against the populated/indexed target; the guards intentionally refuse
rebaseline/reseeding. Any additional target/execution requires its own approval:

```text
node scripts/notifications/staging/schema/bootstrap.cjs --phase=base --execute
node scripts/notifications/staging/schema/bootstrap.cjs --phase=grants --execute
node scripts/notifications/staging/schema/fixtures.cjs --execute
```

Fixture input is one JSON object containing only `password`, supplied privately
on stdin (16+ characters, at most 72 UTF-8 bytes). Never use a command-line or
environment password. Bcrypt cost 12 is applied only after target/catalog checks.
The canonical recipient is fixed `notification-staging@example.invalid`, name
is a synthetic label, tenant `notification-staging`, role Faculty, active with
completed onboarding. There are no pre-created notifications or reset tokens.
No record IDs, hashes, passwords or private fields are returned in results.

## Safe offline checks

From `backend/`, these perform no database/network access:

```sh
node --test scripts/notifications/staging/schema/preparation.spec.cjs
node scripts/notifications/staging/schema/bootstrap.cjs --phase=base --dry-run
node scripts/notifications/staging/schema/bootstrap.cjs --phase=grants --dry-run
node scripts/notifications/staging/schema/fixtures.cjs --dry-run
node --check scripts/notifications/staging/schema/policy.cjs
node --check scripts/notifications/staging/schema/bootstrap.cjs
node --check scripts/notifications/staging/schema/fixtures.cjs
```

## Verification checkpoint — 16 October 2026

- Actual local PostgreSQL role/base/grant/catalog/credential checks passed; the
  four synthetic records have correct tenant/Faculty association. No real account
  or existing database was copied or changed.
- Base/grants/fixtures completed before the separate concurrent index. Index
  definition/validity checks passed. Strict base-catalog rebaseline after this
  extra index is intentionally forbidden.
- The schema suite passed **14/14 offline tests**, including metadata-derived
  model/default/FK/index coverage, least-privilege and mocked rollback safeguards.
  Forced PostgreSQL failure/rollback is not claimed solely from mocked tests.
- Backend dependency health, synthetic frontend login and one success login-history
  record passed. One notification/accepted receipt and one independent Mailpit
  capture were verified; tenant `notification-staging`, Faculty role and active
  status stayed unchanged. Password UPDATE, audit UPDATE, notification DELETE and
  DDL denial checks passed for runtime. Real frontend display/read/dismiss and
  unauthenticated/wrong-tenant/forged-ID rejections passed. An actual deliberately
  failed synthetic insert transaction rolled back, preserving notification count
  one. Redis-down health returned sanitized 503; restoration/health, Redis AOF
  last-write status, duplicate-call refusal and unchanged capture count passed.
  After bounded shutdown corrections, actual Redis-restart + SIGTERM exited 0 in
  7.561 seconds and Redis-unavailable + SIGTERM exited 0 in 4.094 seconds; neither
  OOM. Health restored, duplicate caller refused, Mailpit count remained one.
  Earlier 20/15-second exit-137 attempts are superseded failure history, not erased.
  These actual shutdown tests had no active delivery job; in-flight SMTP drain is
  mock-only. Final notification total/accepted/read/dismissed is one, unfinished
  zero; queue completed one with failed/waiting/active zero. Socket.IO push was not
  instrumented. The pre-drain staging backend is preserved stopped/disconnected;
  no data volumes or original application were changed.
- Existing `.env`, institutional SMTP, original application and all prior data
  remain outside this target. No production or hosted-schema verification ran.

Stop on any mismatch; never repair/reset/reseed a target to make a check pass.
