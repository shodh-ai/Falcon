# Offline deployment boundary checks

These files are reviewable staging material. They do not deploy, invoke Docker,
connect to a database, inspect a server, stop containers, unmount storage, restore,
prune images/volumes, or clean up data. The Python gate can run without root.

Record the existing live container's full ID, immutable image ID, full Git revision
and reviewed image-to-source mapping in a protected baseline based on
`baseline.example.json`. Record **every** existing bind/named-volume mount using
its inspected `Type`, `Source`, `Destination`, `RW`, and `Name` for volumes. Include
the actual configured upload root and `/app/uploads`, which current modules use
directly. If a required upload root is currently ephemeral, preserve its contents
and obtain a separately reviewed persistence change; this gate does not create a
replacement volume or infer that an empty volume is safe.

Supply fresh, minimized inspection evidence for the still-healthy previous
container and the proposed/staged candidate:

```json
{"observed_at":"<current UTC ISO timestamp>","inspect":["<one actual minimized Docker container inspect object>"]}
```

Replace the illustrative string with the actual object. Required fields are `Id`,
`Image`, `Mounts`, `Config.User`, `Config.Labels`, `State.Running`, `State.Paused`,
`State.Restarting`, `State.Health.Status`, and the relevant `HostConfig` settings.
The previous-release wrapper must also contain `image_inspect: {"Id": "<actual
immutable previous image ID>"}` from a fresh, successful image inspection, proving
that its image metadata is still available for rollback. Omit `Config.Env`
and other secrets. Candidate `HostConfig` must include `ReadonlyRootfs`,
`Privileged`, `CapDrop`, `CapAdd`, `SecurityOpt`, `Tmpfs`, `Memory`, and
`MemorySwap`, `PidMode`, `IpcMode`, and `NetworkMode`; host namespaces are refused. Evidence must be at
most five minutes old; gathering it and protecting its provenance is an operator
step, not something this offline validator can authenticate.

The candidate needs an immutable image ID matching the proposed image, plus the
`org.opencontainers.image.revision` label matching the proposed full Git revision.
The old container may lack that label only when its immutable image/revision
mapping is recorded in the reviewed baseline; a present conflicting label fails.
The gate checks the candidate's **actual numeric `UID:GID` configuration** and
rejects named or implicit users. Resolve the image's `node` UID/GID in an isolated
image test, then configure that numeric pair explicitly for deployment. Do not
change ownership of live mounts to satisfy a failed check.

Writable persistent mounts are restricted to the baseline's explicit upload roots.
Code and configuration mounts may only be read-only. Temporary mounts are bounded
tmpfs at `/tmp` and, only if explicitly approved, `/home/node/.cache`, with
`rw,noexec,nosuid,nodev,size=...` (maximum 256 MiB each). Scanners/import tools must
pass isolated workflow tests with these restrictions. The root filesystem is
read-only, all capabilities dropped, and no-new-privileges enabled. `/app/uploads`
must remain writable and persistent even when S3 is configured.

Headroom evidence is a second small JSON file:

```json
{
  "observed_at": "<current UTC ISO timestamp>",
  "available_memory_bytes": "<measured MemAvailable integer>",
  "free_disk_bytes": "<measured free integer on the actual deployment/data filesystem>",
  "working_bytes": "<measured planned deployment working-set integer>"
}
```

Use numbers instead of the illustrative strings. The gate requires a bounded
candidate memory limit with no extra swap allowance, at least that limit plus
512 MiB available (and at least 1 GiB), and free disk of at least
`max(20 GiB, 3 × working_bytes)`. The working set must include image unpack,
temporary deployment state and any planned backup copies on that filesystem.
These conservative checks reject insufficient evidence; they do not guarantee
zero load or measure live application latency.

Run locally against saved evidence:

```sh
python3 -B ops/runtime-boundaries/preflight.py \
  --baseline reviewed-baseline.json \
  --previous-inspect previous-inspect.json \
  --candidate-inspect candidate-inspect.json \
  --headroom headroom.json \
  --candidate-image '<immutable sha256 image ID>' \
  --candidate-revision '<full Git revision>'
```

Any missing/unexpected/repointed persistent mount, broad writable exception,
unhealthy previous image, identity mismatch, missing sandbox setting or headroom
failure exits nonzero. A pass is **configuration evidence only**, not deployment
authorization or proof the candidate is healthy. Recheck current health/headroom
immediately before an independently authorized rollout; maintain the previous
healthy image/revision and original mounts until the new service passes workflow
checks. A failed gate authorizes no cleanup, permission workaround or restart.

## Runtime database role template

`runtime-role.sql.example` is not executed by any script. It expects an already
provisioned, separate, unprivileged LOGIN account with no memberships or owned
objects, and explicit psql variables `runtime_role`, `runtime_schema` and
`runtime_database`. No password belongs in this file, shell argv or review output.
Review on an isolated restored database after the receipt-version migration.

It grants existing application tables ordinary business DML and sequences
USAGE/SELECT in one reviewed schema. It excludes migration-ledger access and
restricts `finance_receipt_versions` to SELECT/INSERT, refusing effective inherited
or PUBLIC mutation privileges that would defeat these boundaries. It removes
CREATE and elevated table/sequence grants **only from the selected runtime role**;
ownership, elevated attributes, memberships, accessible SECURITY DEFINER routines
or residual PUBLIC privileges fail the transaction instead of affecting other
users. It never revokes PUBLIC privileges, transfers ownership, migrates data,
alters passwords, grants superuser or swaps live credentials.

This is a minimum database-object boundary, **not complete business least
privilege**. Other append-only tables, tenant RLS, views/functions, module-specific
write requirements and additional tenant schemas still require explicit review.
No broad default UPDATE/DELETE privileges are installed for future tables. Each
migration requires reviewed grants before an API rollout. Verify receipts retain
history, required workflows work, and runtime cannot change schema, truncate,
rewrite receipt history, mutate the migration ledger or use owner authority.

Run synthetic offline checks with:

```sh
python3 -B -m unittest discover -s ops/runtime-boundaries/tests -v
```

SQL application and actual restricted-role/container tests remain separate,
explicitly authorized verification. Do not treat these synthetic checks as that
verification.
