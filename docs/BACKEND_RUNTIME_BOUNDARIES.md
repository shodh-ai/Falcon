# Backend runtime and deployment identities

This change is prepared locally. It does not alter production permissions, run
migrations, provision storage, or deploy a container. Complete preservation and an
isolated restore before adopting these settings on the live service.

## Deployment order

1. Preserve the current database, every upload root/bucket, deployment configuration,
   application version and the original HR encryption material. Test restoration in
   an isolated environment with external side effects disabled.
2. Prepare a dedicated database migration identity. It owns/manages the application
   schema; the API identity must not own schemas/tables or have superuser, CREATEDB,
   CREATEROLE or schema CREATE authority. Grant the API the required SELECT, INSERT,
   UPDATE, DELETE and sequence privileges on application tables, including tables
   subsequently created by the migrator. Set equivalent default privileges **as the
   object-owning migration role** for every relevant schema. Database DELETE remains
   necessary for existing internal workflows; this infrastructure change alone does
   not implement user-facing soft deletion or approved purge.
3. Run a one-off deployment container using the new image and command
   `node scripts/deploy-migrate.js`. Inject `MIGRATION_DB_HOST`,
   `MIGRATION_DB_DATABASE`, `MIGRATION_DB_USERNAME`, `MIGRATION_DB_PASSWORD`, and
   optionally `MIGRATION_DB_PORT` (default 5432) through the deployment secret store.
   The launcher refuses an implicit database target, missing credentials, a
   migration username matching an explicitly supplied runtime username, all extra
   flags (including repair/seeds), and a failed/interrupted migration. It invokes
   the existing forward-only ledgered runner and advisory lock; review all pending
   migrations before execution. This job must finish successfully before release.
4. Provision the configured S3/MinIO bucket with an administrative identity. Give
   the API bucket-check permission (`HeadBucket`, commonly requiring `s3:ListBucket`)
   and required object-prefix operations, but no bucket creation/administration.
   Configured storage that is absent, inaccessible or unavailable now fails startup
   with deployment guidance. Omitting `S3_ENDPOINT` still selects the existing disk
   mode. Do not omit it to work around a storage outage.
5. Start the API image with its default `node dist/main.js` command and only runtime
   credentials. **Do not inject `MIGRATION_DB_*` into the API.** The image runs as
   `node`; code, dependencies, scripts and migration files remain root-owned. Faculty
   AI checks its existing schema with SELECT-only probes and fails initialization
   when a migration or table grant is missing. No runtime DDL or bucket creation is
   attempted. Keep `DB_SYNCHRONIZE=false`.

The compatibility migration only creates absent Faculty AI tables/indexes and
preserves existing rows and constraints. It does not retrofit the faculty foreign
key into tables previously created by the old runtime fallback. Existing malformed
schemas need a separately reviewed repair; runtime startup will not rewrite them.

## Read-only container filesystem

Set the deployment container root filesystem to read-only, drop Linux capabilities,
set `no-new-privileges`, and do not mount the Docker socket or host backup directory.
The Dockerfile selects a non-root user; engine/deployment configuration must apply
the read-only filesystem and mount restrictions.

Required writable paths in the current application:

| Path | Purpose and requirement |
| --- | --- |
| `/app/uploads` | Persistent read/write mount. Receipts, admission/exam PDFs and faculty qualifications still write here directly, including in S3 mode. |
| Configured `UPLOAD_PATH`, if different | A second persistent read/write mount for modules using this setting. Prefer aligning it with `/app/uploads` after verifying existing stored references; do not move current data as part of permission rollout. |
| `/tmp` | Bounded writable tmpfs for import and malware-scanner temporary files. Content is disposable. Apply `nosuid,nodev`; verify scanner/conversion execution before adding `noexec`. |
| Scanner-specific socket or directory, only if needed | Scope to the deployed scanner's actual requirements. The scan command and any conversion executable must be installed in the image and executable by `node`. |

No writable home/cache directory is required by the default direct-node startup.
Use stdout/stderr for logs. Inventory custom commands before enabling a read-only
root; a command that installs dependencies or writes outside these paths must be
removed or given a narrowly scoped, documented exception.

New upload mounts must be writable by the image's `node` UID/GID. Inspect existing
mount ownership and test on the restored environment first. **Do not recursively
chown, chmod, unmount or recreate live volumes during this rollout.** Preserve
current keys and absolute/relative document paths. Non-root execution does not make
uploads read-only and does not protect them from authorized application deletion.

Backup readers get read-only source mounts and a separate database read/snapshot
identity; backup writers get a separate same-host destination. Neither identity
needs the Docker socket, migration credentials or write access to production.
Finalized backup retention/deletion and any production restore require the user's
specific approval and separate execution authority. These are deployment controls,
not permissions automatically created by this Dockerfile.

## Verification before live adoption

- Run the migration against a restored database with the dedicated identity, then
  run it again and confirm it skips the recorded migration without changing rows.
- Start the API with its restricted runtime role. Verify no schema or bucket-create
  permissions are required and that missing schema/storage fails clearly.
- Exercise authentication, authorized edits, uploads/downloads, receipts, payroll,
  imports/scanning, exports and queues with non-root/read-only settings and the
  current file mounts. Check that code/root paths cannot be written.
- Compare preserved document references and encrypted HR data after restore. Keep
  the old image/configuration available for a deployment rollback; rollback must
  never delete/reinitialize existing database or upload volumes.

Local unit tests mock all database/object-storage calls. A passing build/unit suite
does not validate production mount ownership, storage permissions, SQL application,
container-engine restrictions, or the one-hour recovery target.

## Offline deployment gate and runtime grant staging

`ops/runtime-boundaries/preflight.py` validates saved inspection evidence without
calling Docker or contacting a database. It rejects missing, additional or
repointed persistent mounts against a reviewed baseline; missing previous healthy
container/image/revision identity; missing candidate revision labels; unsafe
runtime settings; stale observations; and insufficient measured headroom. It
requires a verified numeric non-root UID:GID, read-only root, dropped capabilities,
no-new-privileges, bounded temporary paths and writable exceptions confined to
the recorded upload roots. A pass does not start or authorize deployment.

The recorded previous image/revision and original persistent sources must remain
available for rollback. A failed gate does not authorize volume/image cleanup,
mount replacement, ownership changes or unmounting a live service. Evidence
collection and candidate health/workflow validation remain separate operator
steps; saved JSON cannot establish current production state by itself.

`ops/runtime-boundaries/runtime-role.sql.example` stages grants for an existing
dedicated role without executing them. It excludes migration-ledger writes and
receipt-history UPDATE/DELETE/TRUNCATE authority, leaves PUBLIC and other roles
untouched, and refuses inherited/owner/elevated privileges that bypass the intended
boundary. Its existing-table business DML grants are a compatibility boundary,
not a claim that every business permission, append-only table or tenant policy has
been classified. See `ops/runtime-boundaries/README.md` for inputs, prerequisites
and isolated acceptance checks before any production adoption.
