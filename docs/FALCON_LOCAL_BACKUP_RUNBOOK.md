# FALCON local preservation and online backup

This package creates recovery candidates on the existing server while FALCON stays live. It does not stop/restart production containers, restore production, pull images, call an outside storage service, or delete backup files. It does not protect against loss or compromise of the VPS. A completed set is not a proven application recovery until an authorized restore and application validation succeed.

The first protected preservation copy is a separate operator action. This package must not overwrite, relocate or delete that copy, existing Coolify backups, or existing application files.

## Schedule and scope

- One serialized backup set each hour at **:17 Asia/Kolkata**, with no catch-up burst after downtime. The timer does not change the server timezone.
- Both configured non-template databases, currently `postgres` and `university_governance`, are dumped individually in PostgreSQL custom format. The worker refuses a changed database inventory rather than silently omitting a new database.
- A separate cluster-globals export omits role password hashes. Original authentication settings, application encryption keys, Coolify `APP_KEY` and private signing keys require a separately restricted local recovery record. Never place them in the repository or journal.
- The same helper archives uploads and records sorted pre/post file SHA-256 inventories. Finalization rejects inventory changes, unsafe archive members, corrupted gzip data or archive bytes that differ from those inventories.
- Root-owned finalized sets stay under `/data/falcon-backups/finalized/<run-id>/`. No automatic deletion exists. Sundays at **09:00 Asia/Kolkata**, the review timer lists sets aged at least 14 days. It does not remove them.

The observed database physical size was about 116 MB; the initial logical dumps were about 7.6 MB plus an approximately 891-byte empty-database dump. Uploads were approximately 3.62 MB across 100 files. These are initial sizing observations, not storage-growth guarantees. Measure complete new sets before projecting retention costs.

## Components and trust boundaries

`falcon_backup.py` is a fixed root dispatcher and finalizer. It launches only the reviewed `worker.sh` in an already-local, image-ID-pinned PostgreSQL 18 helper. There is no generic Docker command broker, worker-controlled shell command, Docker socket in the helper or host PostgreSQL client dependency.

The helper has a numeric nonroot UID (and explicitly reviewed primary GID), read-only root filesystem, no capabilities, no-new-privileges, 256 MiB memory/swap limit, 0.5 CPU limit and 64-PID limit. It connects only to the existing private database network, publishes no ports, sees uploads read-only and its own staging directory writable, and receives only its restricted PostgreSQL pgpass file. It receives no application environment file or production encryption/signing keys.

The dedicated database role has SELECT coverage and intentional BYPASSRLS for a complete cross-tenant backup. Before dumping each database, the fixed SQL audit rejects superuser/role-creation/database-creation/replication privileges, database/schema CREATE, ordinary table writes, writable sequences, executable user-defined SECURITY DEFINER routines, and membership in any role other than pg_read_all_data (including roles usable through SET ROLE). Read-only transaction defaults supplement the grant audit; they do not replace it. Do not resolve audit failures by granting an administrative role or blindly revoking PUBLIC permissions used by the live application.

The finalizer distrusts staged paths and manifests. It opens directory components with `O_NOFOLLOW`, anchors candidate reads to directory FDs, rejects links/special files, copies into **new** protected files, hashes and checks those copies, fsyncs them, then atomically publishes a new directory. The archive validator accepts only bounded POSIX USTAR or ordinary GNU/BusyBox regular files/directories with a zero GNU extension tail, accepts one bounded GNU longname (101–4096 payload bytes, one terminating NUL, safe UTF-8 path and matching next-header prefix) and rejects repeated/orphan longnames, PAX and other extension types before reading their bodies, and never extracts archive paths. Paths beyond the bounded longname limit fail the backup rather than weakening that check. It does not seal a worker-owned inode by chmod/rename; the worker could otherwise retain a writable FD. Final directories are 0700 and files 0600. Upload names and file hashes stay in the protected manifest, not normal journal output.

The trusted root dispatcher and Docker administrator can still access all same-host data. Local permissions do not withstand host-root compromise. Staging, failed candidates and partial finalizations are retained pending review, so capacity alerts and review are necessary. Root-owned append-only started/completed/failed events under /data/falcon-backups/status record capture bounds, errors and candidate/finalized presence outside the worker-owned staging directory; all remain restore-unproven. A validation failure never silently discards the candidate or partial protected copies.

## Resource and health gates

Before starting, require Linux `MemAvailable >= 1 GiB` and free staging-filesystem disk of at least `max(20 GiB, 3 × configured working_bytes)`. Defaults reserve a 512 MiB working estimate and cap archive expansion at 128 MiB; review actual measurements before raising either limit. Memory/disk metrics must be available; failures refuse the job.

During the helper and finalizer, abort if available memory falls below 768 MiB, the disk gate fails, or two consecutive health rounds fail. Health runs every 30 seconds with bounded, TLS-verifying host curl GET requests; startup health must pass immediately. No redirects, insecure TLS flag, proxy credentials or request payload are used. pg_dump explicitly uses --lock-wait-timeout=5000; its own connection setup resets role statement/lock defaults, so the 15-minute outer helper bound is the dump runtime limit. The approved frontend and API health URLs must both be configured and tested from this host. A Python urllib 403 must not be mistaken for an outage when verified curl GET returns 200.

The shared lock lives in private root-owned /run/falcon-local-backup (0700), recreated safely after reboot for manual commands and managed by both systemd units. Its inode must be a private single-link root-owned regular file. The shared lock serializes scheduled backups, manual finalization, retention review and the optional restore check. A failed or interrupted backup terminates only its generated helper container. It does not kill, restart or modify production. SIGTERM/SIGINT handlers attempt helper cleanup. If Docker cleanup cannot be confirmed, inspect only the generated `falcon-local-backup-*` name and report the condition.

## Review and prepare installation

The installer stages files only; it never creates roles, installs packages, pulls images, changes live upload permissions, starts jobs or enables timers.

1. Review the source and run the local synthetic/mock suite:

   ```sh
   python3 -m unittest discover -s ops/local-backup/tests -v
   ```

2. Fill `config.example.json` into a private reviewed configuration. Pin the already-local PostgreSQL 18 image ID, private network, database container DNS, exact uploads path, database names and the two approved health URLs. The source, staging and final roots must be disjoint. Do not use a mutable image tag or symlinked directories.

3. Confirm the helper UID/GID matches an existing nonroot account **inside the selected image**, so `initdb` can resolve its identity during a later restore check. The backup example uses UID 999 and GID 0: the existing source root is 0750 root:root, so group 0 supplies read/search access without changing live permissions. UID remains nonroot, capabilities are absent and the bind is read-only. This does not grant host root access. Restore uses a separately configured existing image account (the Alpine example is UID/GID 70); verify that image identity before any authorized restore. Check read/search access to source directories and all files as that image user; do not chmod/chown live uploads. The read-only bind prevents helper writes even where its numeric ID matches an application file owner.

4. The dedicated PostgreSQL role is a prerequisite. `readonly-role.sql.example` is review-only SQL and is never executed by the installer. Role creation, password setup and privilege/RLS/SECURITY DEFINER review need the explicit administrator approval recorded for that change. Verify each database's export is complete before scheduling. The worker fails closed if the role or grants are wrong.

5. Enter the backup credential directly into the private pgpass file using a protected channel, never a command argument or chat. The file must be a single-link regular file, owned by the helper UID, mode 0400 or 0600, with root-only parent access. Pgpass format is `host:port:database:user:password`; escape reserved pgpass characters correctly. Scope entries to the selected host/databases/user. No production superuser credential is acceptable for this worker.

6. Review existing Coolify retention/cleanup jobs and ensure they cannot delete preserved backups. This package does not edit their settings. Preserve existing copies before separately authorized changes to schedules.

7. Run the reviewed staging installer as root with the absolute private config path:

   ```sh
   sh ops/local-backup/install.sh /absolute/private/reviewed-config.json
   ```

It validates placeholders, paths, credential ownership and the existence of the local image/network, then copies code/config/units. The installed code and all ancestors must be root-owned and not group/other writable. Python uses isolated mode; no repository working directory or user site packages participate in runtime.

## First custom run and enablement gate

Only after the recorded approval and prerequisite review, reload unit definitions and run the fixed service once. Review the manifest and journal before enabling timers. These are explicit operator steps, not installer side effects:

```sh
systemctl daemon-reload
systemctl start falcon-local-backup.service
systemctl status falcon-local-backup.service --no-pager
journalctl -u falcon-local-backup.service --since today --no-pager
```

Require: both database dumps; globals without password hashes; uploads archive and matching pre/post inventories; protected root ownership/modes; no S3/outside destination; expected scope; passed resource/health guards; no app restart; successful worker `pg_restore --list`; valid root-generated hashes/archive member validation. Check the original preservation directory remains untouched. A header/list check is not a SQL restore. The root-generated manifest includes source identifiers, batch capture start/end times, root-observed running frontend/backend image identities before/after capture, per-file copy times and candidate mtimes (the latter are worker-owned metadata, not exact database snapshot coordinates). Missing release labels or unmatched resource prefixes remain explicit; no snapshot/WAL coordinate is claimed.

If all pass, enable the reviewed timers and inspect their exact next-run times:

```sh
systemctl enable --now falcon-local-backup.timer falcon-local-backup-review.timer
systemctl list-timers falcon-local-backup.timer falcon-local-backup-review.timer
```

Do not also run a duplicate unattended native schedule without accounting for load and space. Native Coolify online dumps are a simpler preservation fallback, but they do not provide this worker privilege audit or protected-finalizer boundary. The operator decides whether an existing native schedule remains after the custom set is validated; no existing backup is deleted.

## Isolated restore: explicit user authorization required

`restore_check.py` has no production-restore operation. It requires a non-secret approval reference plus an explicit confirmation flag, and refuses to start below **1.5 GiB available host memory**. The observed approximately 1.16 GiB availability therefore blocks this check until resources improve; do not lower the gate or stop the app to make it pass.

An authorized check verifies finalized hashes, makes separate private input copies and a fresh scratch directory, then runs the already-local PG18 image with **network none, 256 MiB memory and swap, 0.5 CPU**, no capabilities, no-new-privileges and no production credentials/mounts. PostgreSQL listens only on its private container Unix socket, with small buffers. Cluster globals are deliberately not executed. It restores each custom dump into a disposable database and checks the table inventory. Disk scratch remains for user-authorized deletion; the generated helper container is removed. Resource/OOM failures mean the restore is unproven, not that the backup is necessarily corrupt.

Only after an explicit authorization, an operator may invoke:

```sh
/usr/bin/python3 -I /opt/falcon-local-backup/restore_check.py \
  --run-id REVIEWED_RUN_ID \
  --approval-id RECORDED_EXPLICIT_USER_AUTHORIZATION \
  --i-confirm-disposable-restore
```

The script also aborts if host memory drops below 1 GiB, disk/health guards fail, or 30 minutes elapse. A passed SQL restore still needs a separately planned authorized application/decryption/document walkthrough. Never reconnect a test application to production DB/mail/payments. No restore claim should imply original password hashes, encryption keys or every authenticated workflow was tested.

## Recovery and review limits

Live uploads can change across database and file captures. Matching pre/post and archive hashes catch ordinary file-set/content changes, but they do not create one atomic database-plus-file snapshot. Keep the manifest's consistency caveat. No near-zero RPO or sub-hour recovery is claimed.

On any failure, retain previous completed sets and the first preservation copy. Do not retry repeatedly during memory/health pressure. Inspect only the failed job's staging/partial paths and metadata, correct the reason, and run again after gates pass. No backup is removed without a separate, explicit user authorization identifying the exact scope. Retention review, manifest inspection and this package itself never delete backup artifacts.
