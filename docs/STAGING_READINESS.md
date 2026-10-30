# Staging readiness and database review

This guide records prerequisites, not authorization to provision or deploy.
The approved flow is `feature/*` or `fix/*` from `staging` → reviewed PR into
`staging` → shared testing → reviewed PR into `main` → authorized release.

## Repository status and boundaries

This documentation change starts from staging commit
`efd46fb42759841cba6b5a2598dd2c3017cd59c9`. It changes no application code,
workflow, migration, seed, reset, hosting configuration or credentials.
[PR #188](https://github.com/shodh-ai/Falcon/pull/188) separately proposes the
staging CI triggers and inactive image-publisher template. Until that proposal
is approved and merged, this baseline's CI targets `main`, `develop` and `testing`.
Required checks must not be bypassed because a trigger is missing. This document
does not establish a staging URL, preview deployment or functioning environment.

The 30 October 2026 audit observed main at
`00455c10aa1b5cd4537d27e236ff5944717352a2`, 68 commits ahead of staging.
That is a dated source comparison, not the production deployment identity.
No main-to-staging synchronization is included here. Review the intervening code,
schema, grants and CI together in a separate PR; refresh the comparison then.

## Separate resources and identities

| Resource | Required staging boundary |
| --- | --- |
| Frontend | Its own build and service with explicitly approved staging API/tenant settings. Runtime `API_URL` cannot override every build-time `NEXT_PUBLIC_*` reference. |
| Backend | Its own service, `NODE_ENV=production`, `DB_SYNCHRONIZE=false`, and the existing guarded Docker startup command. |
| PostgreSQL | Dedicated staging instance/database, volume and network access. Use PostgreSQL 18 for the existing reviewed runtime-role procedure; this is not a claim about the live server. |
| Redis/BullMQ | Dedicated authenticated staging Redis and persistence. A notification queue prefix alone does not isolate every queue. |
| Uploads | Separate persistent storage at `/app/uploads`, compatible with backend UID/GID `61001:61001`. Never mount production uploads. |
| Runtime policy | Staging-specific, root-owned policy mounted read-only at `/run/falcon/storage-boundary.json`, with actual staging mount/database identities and `enforce_least_privilege=true`. |
| Authentication | New staging JWT/encryption secrets, synthetic users, and a separate OAuth client/callback if approved. |
| External effects | Capture-only email or reviewed test transport; provider sandbox credentials and staging-only webhook destinations. No production SMTP, payment, storage or integration credentials. |
| Recovery | Staging-specific backups, retention, keys and a demonstrated recovery procedure for the matching data, uploads and permissions. |

Use three separate database responsibilities: restricted API runtime, migration
owner, and provisioning/reset administrator. Supply `DB_*` only for the runtime's
staging target. Keep `MIGRATION_DB_*` out of the API and feature builds; inject them
only into a separately approved one-off migration job. Keep administrator
credentials out of both the API and normal migration job.

Production-mode API startup uses `node scripts/runtime-start.cjs`. It verifies
storage and database boundaries before loading Nest; startup must not automatically
execute migrations, synchronize entities, seed accounts or reset data. A health
check is not permission to skip schema or role verification.

Network controls must prevent staging from reaching production databases, Redis,
storage and integration endpoints. Notification flags do not disable all workers,
schedulers or SMTP senders. Initially omit external credentials, restrict egress,
and list disabled integrations as untested. An approved hostname/TLS and resource
budget must be supplied by the hosting owner; none is assumed here.

## Historical scripts are not staging bootstrap approval

The migration directory combines schema changes with historical institution data,
account/credential updates, seeds, deletions and resets. Filenames containing
`demo` or `seed` do not establish synthetic content or safety. The ordinary
runner excludes `.seed.sql` files but still selects many other data-changing files.

Do not replay the directory through `apply-all-migrations.js`, run ledger repair
or force replay, enable integration-test resets, or use `postdeploy:me` and
department/demo import helpers as a generic staging initialization procedure.
These remain review inputs, not approved commands. Development TypeORM
synchronization checks only a few core tables and is not a complete baseline of
the SQL-defined views, functions, indexes, triggers and reference data.

Existing notification/student fixtures cover components rather than the complete
portal. Some database integration tests create/drop databases or truncate tables;
keep them in their explicitly configured disposable CI environment. In particular,
newer main's Principal integration test accepts `PGHOST`; a generated database
name alone does not prove its server is safe.

Backup, candidate-restore and recovery tools may depend on host-owned files and
real user records. Their availability is not authorization to copy production
data into staging. Do not restore a production backup, password hashes, documents
or institutional imports as synthetic fixtures. Any proposed schema-only export
also needs separate authorization and review for sensitive literals.

## Review gate before any database writer is implemented or run

1. Pin the approved application revision and identify the actual staging server,
   database, role, volume and network. Positively verify connected identity and an
   administrator-controlled staging marker before any future writer runs. An
   environment label, database name prefix or reset flag alone is insufficient.
   Prove production is unreachable without using production credentials.
2. Review a complete baseline against TypeORM entities and SQL-defined objects,
   including the eight reporting materialized views required by the runtime-role
   policy. Document which historical effects are represented and which are
   deliberately excluded. The existing filename/time ledger cannot express all
   baseline dispositions; do not insert false records claiming excluded SQL ran.
3. Review the exact pending migration order, hashes, data effects, grants, locks
   and transaction boundaries. Production-mode staging also requires the existing
   `PRODUCTION_MIGRATION_MANIFEST`; the name is not permission to target production.
   Do not generate blanket approval hashes for the entire directory.
4. Review recovery first. Earlier migration files may commit before a later file
   fails, and historical embedded transactions can commit before the ledger write.
   Reverting Git or an image does not reverse database changes. Identify the
   compatible prior application, staging recovery target, operator and stop rules.
5. Design repeatable fixtures with fictional tenants/accounts, synthetic uploads,
   fresh private credentials, controlled mail delivery and explicit fixture
   ownership. Stop on conflicts instead of overwriting testers' records. Review
   required reference/configuration rows separately from business records.
6. Obtain approval for the target, baseline, sequence, fixtures and recovery plan.
   Only then implement the separate migration/fixture job, using the approved
   maintenance identity. `backend/scripts/deploy-migrate.js` is the existing
   separate wrapper; it neither provisions staging nor proves target isolation.
7. Verify schema, grants, actual runtime login, denial cases, tenant boundaries,
   queues and upload/download behavior before declaring the application ready.
   Record exact image digests and configuration version, not just healthy HTTP.

The newer main leadership changes require matching runtime permission checks and
six-table grants; the older staging launcher may reject the narrower grants.
Review the [pinned leadership procedure](https://github.com/shodh-ai/Falcon/blob/00455c10aa1b5cd4537d27e236ff5944717352a2/ops/deployment-safety/DEPARTMENT_LEADERSHIP_GRANTS.md)
with the source being synchronized. Newer Principal reservations also constrain
backend rollback; review the [pinned Principal release guidance](https://github.com/shodh-ai/Falcon/blob/00455c10aa1b5cd4537d27e236ff5944717352a2/docs/operations/principal-workspace-release.md).
Those references do not import the changes or authorize their execution.

A reset is a separate manual operation, never part of a normal deployment.
Any future reset tool must reverify actual staging identity and reject production,
stop staging workers, preserve needed bug evidence, and coordinate PostgreSQL,
Redis and uploads. No reset tool, fixture executor or migration automation is
introduced by this documentation change.

## Hosting and release approval

Before enabling staging publishing, deploying, or approving a merge into main,
the senior developer must inspect actual Coolify Git triggers, registry polling,
webhooks, image tags/digests, domains, mounts, startup/pre-deploy commands, health
checks and available capacity. Also verify GitHub production environment
reviewers, permitted workflow branches and package access. Do not activate
production publishing or deployment as part of staging setup.

Existing production workflows are already active; this change does not enable,
disable or modify them. Successful main push CI publishes production candidate
images. Manual promotion changes production tags even with `deploy=false`.
Manual workflow inputs do not independently enforce successful CI/main ancestry,
and SHA-named tags can be republished. Do not dispatch either workflow to test
configuration. The audit found no reviewer rules on the production environment;
the senior developer must confirm current protections and obtain separate approval
for any corrections. Documentation cannot enforce that approval boundary.

Use [PREBUILT_IMAGE_DEPLOYMENT.md](PREBUILT_IMAGE_DEPLOYMENT.md) and
[COOLIFY_RESOURCE_GUARDRAILS.md](COOLIFY_RESOURCE_GUARDRAILS.md) as review guides.
They do not confirm dashboard access, server capacity, a staging hostname or a
deployed release. Keep each enabling/provisioning/deployment action separately
authorized; no credentials, secret values or production records belong in PRs.

## Offline documentation checks

These commands inspect source/documents or use synthetic mocks. They do not start
the application, connect to a database, publish an image or probe a real host:

```sh
python3 -B -m unittest discover -s ops/deployment-safety/tests -p test_deployment_documentation.py -v
node --test backend/scripts/resource-boundary.spec.cjs backend/scripts/runtime-start.spec.cjs backend/scripts/deploy-migrate.spec.cjs
```

The documentation check is discovered by the existing Python safety suite when
Falcon CI runs. This PR does not add staging triggers; PR #188 remains a separate
review dependency. Passing offline checks is not staging deployment acceptance.
