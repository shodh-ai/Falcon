# Coolify production resource guardrails

Falcon's release procedure builds images on GitHub-hosted runners and has the
production host pull them. Do not compile Falcon on the production host. These
instructions describe required checks, not proof of the current Coolify settings
or permission to change them. Read [STAGING_READINESS.md](STAGING_READINESS.md)
and [PREBUILT_IMAGE_DEPLOYMENT.md](PREBUILT_IMAGE_DEPLOYMENT.md) before planning a
release. Production publishing, promotion, deployment and merges into `main`
require operator review and authorization; existing workflows remain active.

## Image and runtime behavior

- The Dockerfiles use multiple build stages. Review the selected revision's
  Dockerfiles **and package scripts** for effective build memory options: a package
  script can override the Docker build environment. A Node heap setting is not a
  total-process or container memory limit.
- The inspected Dockerfiles set runtime `NODE_OPTIONS=--max-old-space-size=768`.
  Verify effective runtime overrides and size the container for native allocations,
  buffers, workers and concurrent requests as well as that heap.
- Image health checks specify a 45-second start period, 30-second interval,
  5-second timeout and five retries. Confirm Coolify retains the required checks.
- Backend startup is `node scripts/runtime-start.cjs`. It verifies storage and
  database boundaries before loading Nest; **it never runs migrations**.
- Migrations, when separately approved, use the explicit maintenance wrapper
  `backend/scripts/deploy-migrate.js` and dedicated `MIGRATION_DB_*` credentials.
  The runner's advisory lock coordinates migration jobs, not application startup.

Do not replace the backend Docker command with `npm run start:prod` or direct
`node dist/main.js`: those commands skip the container's boundary launcher.

## Settings the hosting operator must verify

Inventory the live services first. Do not blindly convert an existing resource,
replace its limits, change its mounts or disable a trigger from this checklist.

| Setting | Required verification |
| --- | --- |
| Resource and image | Docker Image resources using the approved frontend/backend image digests. The existing production workflow moves mutable `:production` tags; record and verify their resolved digests before and after rollout. |
| Deployment triggers | Record Git-source auto-deploy, registry polling and webhook behavior. Publishing or moving a tag must not unexpectedly deploy a service. Changing triggers needs separate authorization. |
| Ports | Backend container port `4000`; frontend `3000`. Review generated container names/networking and avoid fixed host-port bindings that prevent rolling replacement. |
| Backend command | Preserve `node scripts/runtime-start.cjs`, `NODE_ENV=production` and `DB_SYNCHRONIZE=false`. Never inject migration credentials into the API. |
| Persistent storage | Preserve exact production upload, PostgreSQL and Redis mount identities and reviewed ACLs. Retain the root-controlled, read-only `/run/falcon/storage-boundary.json` and its matching database identity. |
| Limits | Choose CPU, memory, reservation and process limits from measured load and replacement headroom. Compose defaults or old documentation are not evidence of current Coolify limits. |
| Health and replacement | Enable the required health checks and verify that Coolify retains the healthy container until its replacement is healthy. Check the actual deployed image identity; an old service can answer an HTTP health request. |
| Recovery | Retain the previous compatible image/configuration pair and verified backups. Do not remove volumes, uploads or rollback images to make space for a deployment. |

## Resource gates

The existing [resource guard](../backend/scripts/resource-boundary.cjs) reads
Linux cgroup-v2 `memory.max`, host `MemAvailable` and filesystem free space. It
requires:

- A finite container memory limit between **128 MiB and 8 GiB**, inclusive. This
  accepted range is validation, not a recommendation that either limit fits Falcon.
- Available host memory of at least **max(1.5 GiB, container limit + 512 MiB)**.
- At least **20 GiB** available on each filesystem backing `/app` and `/app/uploads`.

After a healthy guarded image exists, the operator may configure the separately
approved Coolify pre-deployment command `node scripts/resource-boundary.cjs`.
It runs in the existing container; it is not automatically called by the runtime
launcher. A normal recovery restart must still enforce storage/database checks
without being mistaken for a rolling deployment with spare-capacity requirements.

The [host preflight](../ops/deployment-safety/host-preflight.py) additionally checks
the planned candidate budget and working space: available memory must be at least
`max(1.5 GiB, candidate memory + 512 MiB)`, and each declared working filesystem
needs `max(20 GiB, 3 × planned working bytes)` free. Its candidate memory parameter
must be at least 1 GiB. Review actual budgets and target identity; passing the
container guard alone does not establish capacity for both old and new services.

## Authorized rollout order

1. Confirm release approval, current image digests, backup integrity, reviewed
   schema compatibility, resource headroom and unchanged persistent identities.
2. If a schema change is required, use the separately approved migration/grant
   sequence and maintenance identity. Review all pending files and the exact
   manifest. Some changes require a compatibility image before migration; do not
   assume a universal migration-first sequence or run a seed/bootstrap shortcut.
3. Replace the backend with the approved image while retaining the healthy
   compatible release. Verify boundary success, actual image digest, health and
   authenticated critical APIs before progressing to the frontend.
4. Replace and verify the frontend, including login, uploads and the configured API
   destination. Separate service updates are not an atomic release.
5. Stop on a failed check and retain the healthy service. Any image rollback needs
   a database-compatibility review; it does not reverse migrations or restore data.

Image/cache pruning is separate approved maintenance outside deployments. A failed
resource gate is not permission to prune recovery artifacts or build on the live
host. See the [storage/database rollout guide](../ops/deployment-safety/ROLLOUT.md)
for the existing controls and their limitations.
