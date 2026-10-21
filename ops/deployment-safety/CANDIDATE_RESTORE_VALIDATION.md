# Isolated candidate validation

`validate-candidate-restore.py` is an explicit root-dispatcher operation on the existing Linux host. It imports the already reviewed `/opt/falcon-local-backup/restore_check.py` and `falcon_backup.py`, holds their existing shared lock, and calls `run_restore` without changing the backup configuration or its pinned PostgreSQL image. It requires at least 2 GiB available host memory before starting and again before the business-database hook. The existing restore monitor continuously checks memory, disk, live application health and the overall timeout. Its PostgreSQL sandbox retains its existing 256 MiB / 0.5 CPU limits and restores one database at a time.

This additional validation must be reviewed and installed with its adjacent `runtime-role.sql`, root-owned with no writable ancestors. The SQL file must be readable by the disposable PostgreSQL UID70 client (for example root-owned `0444`); it contains no password. The wrapper has no remote import, shell command, alternate restore-tools path, or production environment/key-file option.

Example only, using explicit reviewed local image/container identifiers:

```sh
python3 /opt/falcon-deployment-safety/validate-candidate-restore.py \
  --config /etc/falcon-local-backup/config.json \
  --run-id '<existing-finalized-run-id>' \
  --approval-id '<record-of-current-authorization>' \
  --candidate-image 'sha256:<full-local-candidate-image-id>' \
  --redis-source-container '<full-existing-redis-container-id>' \
  --i-confirm-disposable-restore
```

The Redis source container is inspected only for its immutable image ID. The wrapper never stops, execs into, changes, or attaches to that source container. All test containers use already-local pinned image IDs with `--pull never`; no ports are published. A new Redis runs in a network-none namespace at 64 MiB / 0.1 CPU, with persistence disabled and a 32 MiB data limit. The candidate shares only this new namespace. It has no external route and receives only the protected read-only socket alias of the disposable PostgreSQL server.

The business hook runs after the core restore has verified physical table inventory/counts against the same dump and classified the exact materialized-view inventory. It then:

1. Creates a synthetic `falcon_runtime` LOGIN and a synthetic CRUD fixture table inside `restorecheck` using a separate restricted-resource PostgreSQL client. It applies the reviewed role SQL there, through the read-only Unix socket mount, as disposable `restorecheck`. Neither global roles nor production credentials are replayed.
2. Creates fresh private upload directories and a root-controlled storage policy based on their actual host mount root/device/inode and the core's protected socket alias. No production upload, finalized backup, PGDATA, Docker socket, recovery environment, or production encryption key is mounted into the candidate.
3. Executes only the candidate's storage guard with the correct upload mount, with the mount missing, and with a different directory attached. It requires positive aggregate evidence and the exact expected sanitized refusal for both negative cases before loading Nest.
4. Starts the image's reviewed guarded CMD with a generated synthetic environment and an empty new Redis. Image environment keys outside the supplied environment and the small Node system whitelist are cleared. Image-declared anonymous volumes or another startup command/UID stage are refused.
5. Checks health and then runs a fixed Node probe inside that candidate. The probe connects as the real `falcon_runtime` LOGIN, exercises CRUD on the synthetic table in a rolled-back transaction, and verifies denied persistent DDL, truncate and migration-ledger deletion. It chooses one active restored user internally, signs a short-lived JWT with the synthetic key, and requires `/auth/me` to return the matching user/tenant. It never prints the selected identifiers, token, response body or business records. Finally it calls the actual `ObjectStorageService` disk upload method with synthetic bytes and verifies the resulting file in the disposable upload directory.

The API uses `DB_POOL_MAX=1` because the unchanged restore PostgreSQL server has five total connections, with three normally reserved for superusers; the independent real-login probe occupies the second ordinary slot. This is functional acceptance, not production pool-capacity testing. The existing restore cluster uses trust authentication: the probe proves an actual LOGIN connection as falcon_runtime, rather than SET ROLE, but does not verify SCRAM/password authentication. The first image stage preserves its existing root identity, which is inspected and reported as `nonroot_proven: false`. The candidate, its guard, and its exec probe use `--cap-drop ALL --cap-add DAC_OVERRIDE` so that UID0 can traverse the disposable PostgreSQL UID70/mode0700 socket directory. The runtime verifies that this is the only added capability. Before this stage, the operator must verify that the existing production root process already has DAC_OVERRIDE (effective capability bit 1); this wrapper does not inspect or exec into the production API. This capability is a narrowly recorded test exception, not proof of the final all-capabilities-dropped configuration. PostgreSQL and Redis receive no added capabilities. The read-only root and socket/policy mounts still block filesystem writes; only fresh disposable uploads and temporary files are writable. No source socket permission is changed. A future UID/ACL stage needs a separate reviewed test; this wrapper never changes permissions on the protected socket alias or any live upload source.

The socket-consuming helper always has the exact name required by the core IPC cleanup proof: `context.sandbox_name + '-content'`. All other names derive from the same generated test prefix. Detached application/Redis containers use capped local Docker logs. Raw logs and synthetic credentials remain in the root-private retained session; stdout contains only aggregate counts, image identity and boolean results. Helper cleanup is checked before reporting success; the core independently verifies candidate absence before normally unmounting its protected socket anchor. Failure, incomplete probes, resource aborts, or unconfirmed cleanup leave the result unproven and preserve evidence. No recursive directory removal or deletion of backups, keys, volumes, source uploads or retained scratch is performed.

Synthetic fixture objects and the test upload are added **after** the core count comparison; they are not part of the original dump. Passing this wrapper proves this candidate's isolated startup, restricted login, selected authentication path, synthetic CRUD/denials and disk upload. It does not prove every user journey, existing encrypted HR data, historical document completeness, nonroot permissions, an atomic DB/uploads snapshot, external provider behavior, or recovery from server loss. The existing separate recovery-content checker supplies its own narrower evidence.

Run local tests without Docker or dependencies:

```sh
python3 -B -m unittest discover -s ops/deployment-safety/tests \
  -p 'test_validate_candidate_restore.py' -v
```
