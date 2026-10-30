# Falcon prebuilt-image deployment

Production must pull prebuilt images; do not compile Falcon on the live host.
This guide describes existing workflow behavior and the operator checks required
before a release. It does not authorize publication, promotion, migration,
deployment, hosting changes or a merge into `main`. Read
[STAGING_READINESS.md](STAGING_READINESS.md) for the current readiness gaps.

## Existing active workflows and their limits

The production workflows already exist in `.github/workflows/`. They are active,
not staging templates waiting for activation. This documentation change neither
disables nor dispatches them.

| Workflow | Existing behavior |
| --- | --- |
| [Publish production images](../.github/workflows/publish-production-images.yml) | Automatically builds on GitHub-hosted AMD64 runners after successful `Falcon CI` for a push to `main`. It also accepts manual publication of a supplied revision. It pushes `sha-<revision>` and `main-candidate` tags for both production packages. It does not call Coolify. |
| [Promote production images](../.github/workflows/promote-production-images.yml) | Manual. Checks SHA syntax, image availability and backend guard/source metadata, then moves both `:production` tags. With `deploy=true`, it calls the configured backend webhook, polls backend health, then calls the frontend webhook and polls frontend health. |

A merge into `main` can therefore initiate production image publication after CI.
The live Coolify Git, registry and webhook triggers have not been verified here;
publication or tag movement must not be assumed harmless to the live site.

The publisher's manual path does **not** verify successful exact-revision CI or
that the revision belongs to approved `main`. The promoter also lacks an
exact-revision CI/ancestry/review gate. Its existing guard checks do not replace
release approval or application acceptance. A senior operator must verify the
selected source, CI, reviews, image identities, schema compatibility and hosting
triggers before any new publication, promotion, deployment or merge into `main`.
Automating those missing checks requires a separately reviewed workflow change.

The `production` environment existed with **no required reviewer rule** at the
30 October 2026 metadata inspection. Its name alone is not an approval barrier.
An administrator must recheck its current reviewer/branch rules and review any
proposed protection changes separately. The publisher does not use that
environment, so adding an environment reviewer does not gate its automatic or
manual image builds.

## Image identities

The existing production repositories are:

- `ghcr.io/shodh-ai/falcon-backend`
- `ghcr.io/shodh-ai/falcon-frontend`

The publisher uses `sha-<revision>` tags, but those tags are **not enforced as
immutable**. Rerunning a build can replace a tag, including when dependency
resolution or public build configuration differs. `main-candidate` and
`production` are also mutable. The current release artifact records SHA-tag
references; it does not record the resolved image digests.

For each approved release, record both source revision labels and the actual
`image@sha256:...` digests, along with the build run and public build configuration.
Use digest-pinned references where the approved hosting configuration supports
them. If the existing tag-based promotion path is used, verify tag-to-digest
identity immediately before promotion and actual running digests afterward; that
procedure does not make the workflow's tag operations atomic or digest-pinned.
Stop if an approved tag changes. Preserve the previous compatible digest pair.

Build production and staging frontend images separately. Browser API addresses
and tenant settings are embedded during the frontend build; a runtime URL
override alone does not change all callers or the upload rewrite. Do not promote
a staging frontend image into production.

## Configuration to verify without exposing values

| Location | Names and purpose |
| --- | --- |
| Repository variables | `PRODUCTION_API_URL`, `PRODUCTION_SAAS_BASE_DOMAIN`, `PRODUCTION_DEFAULT_TENANT`, optional `PRODUCTION_GOOGLE_CLIENT_ID`: public frontend build settings. Verify the approved values; source defaults are not evidence of the live configuration. |
| Production environment | Review required reviewers, allowed workflow branches and bypass policy. Environment protection does not supply the publisher's missing revision/CI checks. |
| Production environment secrets | `COOLIFY_BACKEND_DEPLOY_WEBHOOK`, `COOLIFY_FRONTEND_DEPLOY_WEBHOOK`: deploy triggers for the respective existing resources. Do not print, copy into a PR or invoke them to test connectivity. |
| Hosting runtime secret store | Preserve the reviewed database/JWT/integration settings and exact storage policy. Application secrets do not belong in Docker build arguments or images. |
| Registry access | Verify package visibility and permissions. A public Git repository does not prove its packages allow anonymous pulls. For private packages, use approved read-only package access in the hosting registry configuration. |

The production promoter changes `:production` tags even with `deploy=false`.
That option skips its webhook jobs; it is not a dry run and does not disable
hosting-side polling or other triggers. Do not dispatch it merely to validate
configuration.

## Hosting inventory and any future conversion

The hosting administrator must inspect existing Coolify resources before planning
a change. Do not recreate, delete or convert production applications from this
guide. If a conversion from Git-source resources is needed, review that as a
separate operation with its own cutover and recovery plan.

Record privately, without exposing secrets:

1. Current frontend/backend resource identities, running digests and revisions,
   Git-source auto-deploy, image polling and webhook triggers.
2. Domains/TLS, proxy routes, container ports, generated container names, networking,
   health checks, limits, reservations and rolling-replacement behavior.
3. Backend upload, PostgreSQL and Redis mount identities; protected policy path,
   database role, configuration version, ownership/ACLs and verified backups.
4. Registry pull permissions and the previous compatible image/configuration pair.

The intended prebuilt resources use backend container port `4000` and frontend
`3000`, without fixed host-port bindings that obstruct rolling replacement.
Verify the image health checks and at least their 45-second start allowance.
Keep the previous healthy service until the replacement is verified. Measure
resource budgets rather than applying an unverified fixed memory/CPU recipe.
A domain may have only its intended active owner during an approved cutover.

## Guarded startup and separately reviewed schema changes

Preserve the backend Docker command `node scripts/runtime-start.cjs`. It checks
the root-controlled, read-only `/run/falcon/storage-boundary.json`, persistent
upload mount identities and database identity/permissions before loading Nest.
It requires `NODE_ENV=production` and `DB_SYNCHRONIZE=false`, ignores image-local
dotenv configuration, and refuses injected `MIGRATION_DB_*` credentials.
Direct `npm run start:prod`/PM2 execution is not an equivalent guarded startup.

**The runtime launcher does not migrate, seed or initialize its database.** Required
schema changes need a separate approved sequence using
`backend/scripts/deploy-migrate.js`, dedicated maintenance credentials and an
exact reviewed `PRODUCTION_MIGRATION_MANIFEST`. Review every pending SQL file,
its data effects, grants, transaction boundaries and recovery plan. Do not
auto-approve the directory, use runtime credentials, or add seed/repair/force
shortcuts. Some releases require a compatibility image before schema/grant changes;
use the sequence reviewed for the actual target and revision.

The [storage/database rollout guide](../ops/deployment-safety/ROLLOUT.md) describes
the existing boundaries. These checks do not independently prove complete schema,
business correctness or a usable rollback.

## Authorized release verification and recovery

Before any release operation, obtain explicit operator authorization for the exact
candidate and confirm the missing approval/hosting controls above. Verify successful
CI and reviews for the exact revision, both image digests, tested public frontend
configuration, schema/grant sequence, backup integrity and rollback compatibility.

Use the [resource guardrails](COOLIFY_RESOURCE_GUARDRAILS.md): the container guard
requires **20 GiB** free on both `/app` and `/app/uploads` filesystems, and host
available memory of at least `max(1.5 GiB, container limit + 512 MiB)`. The host
preflight additionally checks the candidate budget and three times planned working
space. These are checks to run through the reviewed deployment procedure, not
proof that the current host has sufficient capacity.

After an authorized rollout, verify actual running image digests/revisions,
storage/database boundary acceptance, backend and frontend health, authenticated
login, uploads and critical business paths. The workflow's HTTP health poll can
succeed against the previous service; it does not prove the candidate deployed.
The two services are updated separately, so partial failure requires operator
assessment rather than an assumption of atomic release.

An authorized rollback uses the previously verified compatible image/configuration
pair after checking the current schema. Do not assume the old SHA tag still points
to its original digest. The promotion guard also compares backend guard files with
the selected workflow policy; an older image may be refused. Review that
compatibility and stop on refusal instead of bypassing the checks. Reverting an
image does not reverse migrations or authorize restoring an older dump over live
records.

Keep backups, upload/database/Redis volumes and images needed for recovery. Do not
prune them to satisfy a failed resource check. Any pruning or database restore is
separate approved maintenance. No production operation is performed by this guide.
