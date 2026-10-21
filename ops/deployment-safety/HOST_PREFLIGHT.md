# Live read-only host preflight

`host-preflight.py` gathers its own current observations from the local Docker
socket and host filesystem. It does not accept saved inspection JSON or a claimed
`passed` value. It never deploys, pulls an image, executes in a container, queries
SQL, restarts a service, initializes storage, changes ownership or removes data.
Run the reviewed file with isolated Python as root on the production host.

This is a gate for a controlled deployment path, **not an interception mechanism
for Coolify UI actions**. PostgreSQL/Redis resource replacement and unrestricted
administrator actions must use the controlled path or remain separately
restricted. The separate API startup boundary guards application replacements;
an API process cannot establish which host Docker volume PostgreSQL uses.

## What a pass means

- Exactly one active API container matches the known FALCON resource prefix.
  Stopped rollback containers may remain. PostgreSQL and Redis are looked up by
  their exact existing container names.
- API, PostgreSQL and Redis are still running and healthy, with the full current
  container IDs and immutable image IDs recorded in the protected baseline. The
  API's source revision label matches its baseline revision.
- Every bind/named-volume mapping exactly matches its baseline, including mode,
  source, destination and volume name. Missing, additional, duplicate or nested
  mounts fail. Sources exist as the expected type; every path component is checked
  without following symlinks. Device and inode match the recorded source root.
- API uploads remain the bind
  `/data/coolify/applications/pmy0ybhwzco11kocu0zloqk0/uploads` at `/app/uploads`.
  PostgreSQL 18 retains `postgres-data-acdz53zfy2eqstxeybua41rs` at
  `/var/lib/postgresql`; Redis retains `redis-data-y13hscsoka5mti9mjtfptqlh` at
  `/data`. All three data mounts remain writable. Local named-volume driver,
  scope, mountpoint and absence of custom volume options are checked.
- PostgreSQL's exact explicit `PGDATA` value still matches the baseline and stays
  below `/var/lib/postgresql/`. It is never inferred as
  `/var/lib/postgresql/data` and is never created by this helper.
- The prior images remain locally inspectable for rollback. The candidate image
  is already local, identified by its immutable `sha256:` image ID, and carries
  the exact requested full Git revision. Tags alone are not accepted.
- `MemAvailable` is at least the candidate's planned memory plus 512 MiB, with
  a 1.5 GiB minimum. Candidate memory defaults to 1 GiB and cannot be lower.
  Free space on both data and Docker storage is at least
  `max(20 GiB, 3 * planned working bytes)`.
- Resources and source roots are reinspected during the same capture. A capture
  taking over 30 seconds or a baseline change during capture fails.

A pass is a point-in-time configuration observation. It does not establish that
the future candidate has the right mounts, is healthy, has compatible database
permissions or has replaced the public response. It does not freeze Docker or
prevent a later administrator change. The controlled rollout must serialize its
actions, recheck immediately before replacement, preserve the healthy image and
verify actual replacement identity, startup boundary and critical workflows.

## Protected baseline

The baseline JSON must be a root-owned, single-link regular file with mode `0600`
or stricter. All ancestors must be root-owned, non-symlink directories and not
writable by group/others. Do not place credentials, environment dumps, database
rows, file contents or health logs in this metadata file.

Schema (illustrative placeholders must be replaced with actual observations):

```json
{
  "schema_version": 1,
  "resources": {
    "api": {
      "container_id": "FULL_CURRENT_64_HEX_CONTAINER_ID",
      "image_id": "sha256:CURRENT_64_HEX_IMAGE_ID",
      "revision": "CURRENT_40_HEX_GIT_REVISION",
      "mounts": [{
        "Type": "bind",
        "Source": "/data/coolify/applications/pmy0ybhwzco11kocu0zloqk0/uploads",
        "Destination": "/app/uploads",
        "RW": true,
        "source_identity": {"device": 0, "inode": 1}
      }]
    },
    "postgres": {
      "container_id": "FULL_CURRENT_64_HEX_CONTAINER_ID",
      "image_id": "sha256:CURRENT_64_HEX_IMAGE_ID",
      "pgdata": "/var/lib/postgresql/18/docker",
      "mounts": [{
        "Type": "volume",
        "Name": "postgres-data-acdz53zfy2eqstxeybua41rs",
        "Source": "/var/lib/docker/volumes/postgres-data-acdz53zfy2eqstxeybua41rs/_data",
        "Destination": "/var/lib/postgresql",
        "RW": true,
        "source_identity": {"device": 0, "inode": 1}
      }]
    },
    "redis": {
      "container_id": "FULL_CURRENT_64_HEX_CONTAINER_ID",
      "image_id": "sha256:CURRENT_64_HEX_IMAGE_ID",
      "mounts": [{
        "Type": "volume",
        "Name": "redis-data-y13hscsoka5mti9mjtfptqlh",
        "Source": "/var/lib/docker/volumes/redis-data-y13hscsoka5mti9mjtfptqlh/_data",
        "Destination": "/data",
        "RW": true,
        "source_identity": {"device": 0, "inode": 1}
      }]
    }
  },
  "working_filesystems": ["/data", "/var/lib/docker"]
}
```

Capture every existing bind/volume, not just the data mounts in this example.
Use actual host `lstat` device/inode integers. Validate actual volume mountpoints
and the exact `PGDATA` value rather than copying the illustrative values above.
Retain the reviewed data-root identities across releases. A verified API rollout
requires a reviewed refresh of the current API container/image/revision metadata;
do not blindly regenerate the baseline from an unexpected new or empty source.

The one permitted file-source mount is the root-protected startup boundary:

```json
{
  "Type": "bind",
  "Source": "/etc/falcon-deployment-safety/storage-boundary.json",
  "Destination": "/run/falcon/storage-boundary.json",
  "RW": false,
  "source_type": "file",
  "source_identity": {"device": 0, "inode": 1}
}
```

Record that exact mapping in the current API baseline only after its reviewed
rollout. Before the first rollout it is absent from the current-container
baseline. Its root-owned source file/ancestors must not be group/other writable;
the metadata file may be readable to the runtime UID through the read-only bind.
This exception permits no arbitrary file bind and no writable boundary file.

## Invocation and verification

After an independently authorized image pull and baseline review:

```sh
/usr/bin/python3 -I /opt/falcon-deployment-safety/host-preflight.py \
  --baseline /etc/falcon-deployment-safety/host-baseline.json \
  --candidate-image sha256:REVIEWED_IMMUTABLE_IMAGE_ID \
  --revision REVIEWED_FULL_GIT_REVISION \
  --working-bytes REVIEWED_POSITIVE_WORKING_BYTES
```

Working bytes must include planned image unpacking, temporary deployment state
and backup/rollback working space. Observe additional filesystems if that work
spans them. The helper prints only minimized identity, baseline hash, resource
counts and headroom metadata. Docker formatting selects no complete environment,
health log, credential or database record. The PGDATA inspection selects only
that named, non-secret path. Docker stderr is not echoed on failure. Formatting
uses Docker's documented `json` and `split` helpers:
<https://docs.docker.com/engine/cli/formatting/>.

Failure authorizes no cleanup, retries under resource pressure, storage creation,
permission workaround or removal of a healthy container. Preserve evidence and
correct the specific observation through the reviewed maintenance process.

Synthetic checks run locally without Docker or production data:

```sh
python3 -B -m unittest discover -s ops/deployment-safety/tests -p test_host_preflight.py -v
```

The injectable runner and filesystem exist for synthetic tests. The CLI has no
offline-evidence option and always uses live local observations.
