# FALCON storage and database deployment protection

Application container replacement must reuse the existing upload bind, PostgreSQL
volume and Redis volume. No release in this procedure moves, initializes, deletes,
unmounts or changes ownership of production data. Production restore and permanent
deletion still require the owner's explicit approval for the exact operation.

## Application startup

The default image command runs `scripts/runtime-start.cjs`. Before loading Nest it:

- validates the root-controlled, read-only `/run/falcon/storage-boundary.json`;
- verifies upload mount points, kernel mount roots, devices and directory inodes;
- refuses missing, substituted, ephemeral or unexpected mounts and inaccessible uploads;
- pins the database host, port, name and account, disables schema synchronization,
  refuses migration credentials, and checks actual database metadata using a read-only transaction;
- checks restricted-role authority when the protected policy enables enforcement.

The API startup never executes the migration runner. Faculty AI uses SELECT-only
schema readiness checks. Production ignores image-local dotenv files, so those
cannot change paths or database settings after the boundary checks.

After the first healthy guarded release, configure Coolify's pre-deployment
command to `node scripts/resource-boundary.cjs`. This checks bounded cgroup memory,
available host memory of at least the greater of 1.5 GiB and that limit plus 512 MiB,
and 20 GiB free on application/upload filesystems. It runs in the existing container
before routine deployments. The host gate additionally checks the candidate budget
and three times planned working space. A normal crash/reboot restart does not run
the deployment headroom gate: recovery must not be blocked solely by the reserve
needed to run two containers during an update. Storage/database checks still run.

This is protection against configuration mistakes and excessive runtime authority.
An infrastructure administrator can replace images, commands or configuration;
these checks are not a defense against host-root compromise. Application business
UPDATE/DELETE permissions remain necessary and are not a complete tenant policy.

## Staged adoption

1. Preserve exact images, revisions, all mount identities, PGDATA, private runtime
   configuration, keys, file hashes and ACLs on the server. Validate the newest
   backup artifacts. Keep production running.
2. Test the immutable candidate against a disposable restore with network egress,
   email, payments, webhooks and existing queues disconnected. Use actual PostgreSQL
   18 role tests as well as startup and authenticated read checks. Synthetic fixture
   passes alone are insufficient production evidence.
3. Install the protected baseline as a read-only file bind. The first policy pins
   the existing account with `enforce_least_privilege:false`; the OS identity also
   remains unchanged. This deliberate transition establishes a healthy,
   migration-free rollback image before changing credentials. Report that status
   explicitly; it is not database permission hardening yet.
4. Run the live host preflight immediately before rollout. Confirm generated
   container names, no host port bindings/custom IP, and enabled health checks,
   so Coolify starts and checks the replacement before removing the old container.
   Verify the actual new container image, revision, mount identity and health.
5. After isolated restricted-role acceptance, provision a new unprivileged account
   and apply reviewed `runtime-role.sql` to the explicit business database/schema.
   Keep the owner/admin migration credentials in protected maintenance storage,
   outside the API. Never transfer table ownership to the runtime role.
6. Update the protected policy to that exact role with enforcement true and update
   runtime credentials through the deployment secret store. Replace only the API;
   preserve the same data mounts and retain the healthy migration-free image.
7. Adopt numeric non-root execution/read-only filesystem as a separate stage only
   after snapshotting ACLs and proving required upload/temp/scanner workflows.
   No recursive ownership changes or permission workarounds are authorized.

Protected policy updates need a reviewed replacement container: file bind mounts
can retain an older inode after atomic host-file replacement. Reinspect the actual
new mount and bound policy, rather than assuming a saved host file reached it.

## Runtime database scope

The SQL grants business-table/view CRUD, sequence USAGE/SELECT and ledger SELECT.
Only the eight named reporting materialized views receive MAINTAIN for existing
refresh operations. It refuses ownership, memberships, elevated attributes,
persistent schema/database CREATE, migration-ledger mutation, TRUNCATE, grant
delegation and unreviewed inherited/PUBLIC authority. Public temporary-object
permission is a separate PostgreSQL default; no global PUBLIC revocation is made.

New tables require separately reviewed grants. There are no broad future default
grants. Missing grants or new unreviewed relation types block startup. Database
business DELETE is preserved; this change does not implement application soft deletion.

`deploy-migrate.js` is an explicit maintenance job, not an automatic release hook.
Its existing runner considers every pending ledger filename. Inspect the actual
ledger and every pending SQL file before invoking it, including historical seeds;
do not assume only the new compatibility migration will run. No repair/seed/force
flags or runtime-credential fallback are accepted by the launcher.

## Database-container changes and rollback

The authoritative host preflight observes API/PostgreSQL/Redis through the local
Docker socket without changing them. PostgreSQL 18's verified mount destination
is `/var/lib/postgresql`. A CI JSON attestation is not a substitute for this live
check, and the helper does not intercept arbitrary Coolify database-resource UI
operations. Keep those administrative operations on the controlled, checked path.

An unhealthy candidate, insufficient headroom or failed storage/permission check
stops the candidate work. Keep the previous healthy service and its existing
storage. Rollback changes the image/configuration; it never restores an older dump
over current business records. Do not delete volumes, uploads, images needed for
rollback or backups to make a deployment succeed.

Backups remain on this server. No near-zero-loss or full one-hour recovery claim
follows from these deployment controls.
