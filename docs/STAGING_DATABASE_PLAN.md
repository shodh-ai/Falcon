# Staging database plan and approval gate

**Status: reviewed source inventory and proposed procedure only.** This change
does not create a database, baseline, fixture set, migration manifest, reset job,
or database deployment automation. No database was contacted, copied, migrated,
seeded, reset, or restored for this setup. Execution requires separate approval
of the exact target, migration sequence, and recovery procedure below.

Use this with [STAGING_SETUP.md](STAGING_SETUP.md) and
[DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md). The intended branch flow is
feature/fix → `staging` → reviewed release PR → `main`. Promoting application code
does not copy staging data into production or authorize a production migration.

## What the repository already provides

This inventory was checked against upstream `main` commit
`efd46fb42759841cba6b5a2598dd2c3017cd59c9`.

- The backend uses TypeORM entities plus handwritten SQL in
  [`backend/migrations`](../backend/migrations). Entity synchronization alone is
  not a verified complete schema: application queries also depend on SQL-defined
  tables, views, functions, indexes, triggers, and reference data.
- There are **370 SQL files**. The ordinary
  [`run-migrations.js`](../backend/scripts/run-migrations.js) path selects **369**,
  excluding only files ending in `.seed.sql`. Of those selected filenames, 54
  contain `seed`, `reset`, or `demo`; names are not a safety classification.
  Historical SQL includes account/credential resets, institution data, and
  document deletions. The two files selected by the separate standard seed
  command also remain eligible for ordinary migration execution.
- With a production environment marker, the runner requires
  `PRODUCTION_MIGRATION_MANIFEST`: version 1 with a mapping of reviewed pending
  filenames to their exact SHA-256 hashes. It validates every pending file before
  writing the ledger, retains the reviewed bytes, serializes migration runners
  with an advisory lock, and stops at the first failure. It refuses production
  force/replay, ledger repair, schema synchronization, and explicit seed modes.
- The ledger records filenames and timestamps, not applied-file hashes or
  baseline dispositions. The manifest checks pending files; it does not prove
  that existing schema or previously recorded migrations match their source.
  Earlier successful files remain committed if a later file fails. Eighteen
  historical files contain their own `BEGIN`/`COMMIT`, which can end the runner's
  transaction before its ledger write. Review transaction boundaries explicitly.
- [`deploy-migrate.js`](../backend/scripts/deploy-migrate.js) is an explicit,
  separate job using `MIGRATION_DB_*` credentials. It rejects command arguments
  such as seed/repair flags. It is not invoked by the API and does not provision
  infrastructure, prove target isolation, or create a complete fresh baseline.
- [`sync-schema.js`](../backend/scripts/sync-schema.js) permits synchronization
  only with explicit non-production opt-in. Its existing-schema check looks for
  just `users`, `roles`, and `tenants`; that does not establish schema completeness.

The actual production PostgreSQL catalog and applied migration ledger have not
been inspected. Repository files alone cannot confirm their current state.

### Source changes since that inventory

On 29 October 2026, `main` had advanced to
`68ab62516751eaea1f3b0e3b11da7512d19243e1`, while `staging` remained at the
starting commit above. That newer source contains eight additional SQL files
(378 total, 377 selected by the ordinary runner). The runner, synchronization
script, deployment migration wrapper and Dockerfiles are unchanged, but the
runtime launcher and role policy now give six leadership/identity tables narrower
column-scoped, append-only or read-only access. The older launcher can refuse
startup against that newer schema and grant policy.

Before building a shared staging baseline, review a `main` → `staging` sync PR
and repeat the schema/grant inventory at its approved revision. The newer
`ops/deployment-safety/DEPARTMENT_LEADERSHIP_GRANTS.md` requires a compatibility
image, reviewed migration, six-table grant delta and runtime/rollback verification
before the full release. Review that sequence with the matching code; do not
combine the older staging runtime with an independently copied newer-main schema.
These newer application changes are not merged by this workflow setup.

Newer login/token code also queries leadership tables: a passing startup guard
does not prove login readiness if those tables are missing. The academic-class-moves
migration grants permissions only to a role named `falcon_runtime`; a differently
named staging role needs explicitly reviewed grants. The synchronization PR must
preserve newer-main CI coverage for timetable/attendance as well as this PR's
staging checks.

## Infrastructure and credential requirements

The hosting owner must first approve and identify a dedicated staging PostgreSQL
instance/database with its own volume and restricted network. Use PostgreSQL 18
for the existing reviewed runtime-role procedure: its version check explicitly
requires 18. This recommendation does not claim the live database was queried.

Provision new credentials privately for three separate responsibilities:

| Responsibility | Required boundary |
| --- | --- |
| API runtime | Staging business access; no persistent schema ownership, migration-ledger writes, or administrative role membership |
| Migration owner | Approved staging schema changes only; credentials supplied solely to a separately approved migration job |
| Provisioning/reset administrator | Isolated staging instance/volume administration; unavailable to the API, feature builds, and ordinary migration job |

Use the runtime names `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and
`DB_PASSWORD`. Reserve `MIGRATION_DB_HOST`, `MIGRATION_DB_PORT`,
`MIGRATION_DB_DATABASE`, `MIGRATION_DB_USERNAME`, and `MIGRATION_DB_PASSWORD` for
the migration job. Set `NODE_ENV=production` and `DB_SYNCHRONIZE=false` for the
shared staging runtime and its future deployment migration job. The existing
`PRODUCTION_MIGRATION_MANIFEST` name also applies to production-mode staging.
Do not change environment labels to bypass a refusal.

Keep production credentials and routes unavailable to staging. A separate tenant
or schema in the production database is not the proposed isolation boundary.
Staging Redis, upload volumes/object storage, authentication secrets, and outbound
integration credentials must also be separate. Capture test mail and use approved
sandbox integrations; do not send fixtures to real recipients or payment systems.

The existing [runtime launcher](../backend/scripts/runtime-start.cjs) checks
configured DB identity, storage boundaries, and optionally object privileges.
Require a separately reviewed staging boundary with least-privilege enforcement.
The checks still allow business data modification; they are not tenant isolation
or protection against erroneous business DELETE statements. Standalone database
scripts do not automatically receive these runtime protections.

Before any future writer is enabled, its design must positively verify the
approved host/port, server identity, database, role, dedicated volume/network, and
an administrator-controlled staging marker. An environment label or naming
convention alone is insufficient. Verify that production is unreachable from that
job and that its credentials cannot authenticate there. These provisioning and
writer identity checks are **requirements to implement and review**, not existing
complete automation. Do not test production credentials or endpoints to establish
this boundary.

## Required review sequence before any migration execution

1. **Identify the exact target.** The hosting owner records the staging service,
   network, database, volume, role separation, access controls, and PostgreSQL
   version. No secrets go into this repository, logs, screenshots, or review text.
2. **Select a pinned application commit and inventory the required schema.**
   Review TypeORM entities and SQL-defined objects together. If the owner later
   authorizes a schema-only export or production ledger inspection, treat it as a
   separate read operation; review the export for sensitive literals and do not
   copy business rows, accounts, password hashes, or uploaded documents.
3. **Design a complete staging baseline and truthful history mapping.** Distinguish
   SQL actually executed, historical effects represented by the baseline, and
   operational/data changes explicitly excluded. The current filename-only
   ledger cannot represent those distinctions by itself. A baseline-aware design
   needs separate review; do not invent ledger rows claiming excluded files ran.
   Keep production migration files and its existing history unchanged.
4. **Review the exact incremental sequence.** Record starting schema/ledger,
   target schema, ordered filenames and SHA-256 hashes, schema/data/credential
   effects, required privileges, locks, transaction boundaries, expected duration,
   and failure conditions. Every pending file needs review; do not auto-approve
   hashes for the whole directory. New migrations should be forward-only and
   backward-compatible where practical; preserve already released files.
5. **Review recovery before approving writes.** Identify the staging backup or
   checkpoint, restore target, compatible previous application image, recovery
   owner, stop conditions, and verification checks. Plan a restore rehearsal on
   another isolated staging target; it has not been performed by this setup.
6. **Obtain explicit approval for this target and sequence.** Only then may an
   operator implement and execute the approved baseline/migration process using
   the dedicated identity. Stop on mismatch or error. Existing migration errors
   can include raw database messages; review log handling before automation.
7. **Verify the result before application rollout.** Check actual schema and
   ledger, constraints/indexes, role grants, synthetic fixture ownership, runtime
   startup checks, login, representative workflows, and isolation failures. Report
   executed results separately from source inspection or mocked tests.

The baseline must include the eight materialized views required by the reviewed
[runtime-role policy](../ops/deployment-safety/runtime-role.sql):

- `iqac_mv_placement_stats`, `iqac_mv_student_counts`,
  `iqac_mv_faculty_metrics`, `iqac_mv_repository_health`
- `exec_mv_finance_summary`, `exec_mv_placement_trends`,
  `exec_mv_academic_schools`, `exec_daily_university_health`

Verify their definitions and dependencies, not just names. The policy does not
grant access automatically to future objects; review grants after each schema
change. Production-specific provisioning helpers must not be reused unchanged
for a new staging target. See the existing
[rollout guide](../ops/deployment-safety/ROLLOUT.md) and
[rollout operations](../ops/deployment-safety/ROLLOUT_OPERATIONS.md) for controls to
review, not commands authorized by this staging plan.

## Synthetic data and reset design

A future fixture set should use fictional tenants, students, faculty and staff,
`.invalid` email addresses, synthetic documents, private newly generated
credentials, and a small representative set of approved workflows. Include
cross-tenant/access-denial checks. Track fixture ownership and stop on conflicting
existing data instead of overwriting it. Review required reference/configuration
data separately from account and business data.

Existing [notification staging preparation](../backend/scripts/notifications/staging/schema/OWNER_REVIEW.md)
is a minimal 16-table component schema, explicitly not full portal equivalence.
Existing [student smoke fixtures](../backend/scripts/student-smoke/core.cjs) are
restricted to a particular local DB/API and require an already prepared schema.
They provide useful safety patterns, not a shared-staging bootstrap command.

Do not use generic replay/repair/reset shortcuts: `apply-all-migrations.js`,
`db:migrate:repair`, `--force`, entity synchronization, or the integration-test
reset. The test reset can truncate every public table except the migration ledger
when flags are enabled; those flags do not independently verify the database.
Department bootstrap/import scripts use institution data, and department rollback
reverses a specific import rather than an application release.

Any future shared-staging reset must be a separately approved manual operation.
Stop the staging API/workers, verify the dedicated target again, preserve any
needed test evidence, recreate only the approved staging data store, apply the
approved baseline/incremental sequence, and load synthetic fixtures. Coordinate
staging Redis queues and uploaded files so they do not reference removed records.
No reset job or executable reset instructions are supplied here.

Application rollback and database recovery are separate decisions. An old image
may be incompatible after a schema change. Prefer a reviewed corrective migration
where appropriate; restore only the specifically approved isolated target using
the reviewed recovery procedure. Never automatically downgrade or restore the
production database when reverting application code.

## What remains to be approved and built

Infrastructure access/provisioning, complete schema baseline, historical mapping,
synthetic fixture implementation, writer identity checks, exact migration and
grant sequence, backup/restore rehearsal, reset procedure, and database-connected
acceptance tests remain outstanding. Until those are approved and verified,
repository CI or a successful image build does not mean staging data is ready.
