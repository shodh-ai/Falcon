# Falcon staging setup and release controls

**Status: configuration prepared; shared staging and PR previews are not yet operational.**
This guide was prepared from repository revision
`7b3c8a99228c594be16327ed004a54d5cd6da524` on 24 October 2026. No staging URL,
server capacity, database, credentials, DNS ownership, or hosting dashboard settings
have been confirmed. Publishing images does not deploy them or provision their dependencies.

Use [DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md) for everyday Git and PR
steps. This document covers the administrator's one-time setup and operational
handoff. Do not run production deployment or database operations merely to complete
this setup.

## What the repository actually uses

| Area | Confirmed repository configuration | Source |
| --- | --- | --- |
| Web portal | Next.js 16.3.1, React 19.2.4, TypeScript; standalone Docker image, port 3000 | `frontend/package.json`, `frontend/next.config.ts`, `frontend/Dockerfile` |
| API | NestJS 11, TypeScript, TypeORM and PostgreSQL; Docker image, port 4000 | `backend/package.json`, `backend/src/app.module.ts`, `backend/Dockerfile` |
| Deployment | Coolify, prebuilt Linux AMD64 images in GitHub Container Registry (GHCR) | [Prebuilt deployment guide](PREBUILT_IMAGE_DEPLOYMENT.md), `.github/workflows/publish-production-images.yml` |
| Production origins | Web: `https://falcon.jataka.io`; API: `https://apifalcon.jataka.io` | `.github/workflows/promote-production-images.yml` |
| Background work | Redis and BullMQ | `backend/src/app.module.ts`, `backend/src/core/redis/redis-connection.config.ts` |
| Uploads | S3-compatible storage when configured; otherwise persistent disk uploads | `backend/src/storage/object-storage.service.ts` |
| Authentication | Local accounts/JWT and Google OAuth; the Keycloak provider currently delegates to local JWT | `backend/src/auth/auth.module.ts`, `backend/src/auth/providers/keycloak-auth.provider.ts` |
| Integrations | SMTP, Razorpay/PayU, Gemini, GST verification, helpdesk and module event webhooks/signing keys | Backend environment template and integration source files |
| Other application | Expo/React Native mobile application; this setup does not release mobile builds | `falcon-mobile/package.json` |

These are source-code findings, not proof of what currently runs on the hosting
account. No Vercel or Supabase deployment configuration was found in the inspected
application configuration. Do not introduce either provider for this workflow.

The root `docker-compose.yml` is local development infrastructure with PostgreSQL
16 and local defaults. It is not the full staging stack. The existing
`backend/scripts/notifications/staging/compose.review.yml` is preparation for a
specialized notification test service, not a deployed shared portal.

## 1. Protect the release controls in GitHub

An administrator must complete the environment controls before enabling production
promotion. The presence of `environment: production` in a workflow does not itself
require approval.

1. Open the [Falcon repository](https://github.com/shodh-ai/Falcon), then **Settings
   → Environments → production**. If absent, select **New environment**, enter
   `production`, and select **Configure environment**.
2. Enable **Required reviewers** and select the authorized release owner or team.
   Enable **Prevent self-review**. There must be another eligible reviewer available.
3. Clear **Allow administrators to bypass configured protection rules**. Save the
   protection rules.
4. Under **Deployment branches and tags**, select **Selected branches and tags**.
   Add a **Branch** rule for `main`; do not add a wildcard or tag rule.
5. Keep the production deployment webhooks in **Environment secrets**, under the
   existing names `COOLIFY_BACKEND_DEPLOY_WEBHOOK` and
   `COOLIFY_FRONTEND_DEPLOY_WEBHOOK`. Do not copy them to staging.

These menu labels and rule behavior are documented in
[GitHub's environment setup guide](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
If controls are unavailable, ask the repository administrator to check the account
plan and repository visibility; required-reviewer availability varies by plan.
Do not treat a missing approval rule as an approved production release.

Verify the `main` and `develop` branch protections in **Settings → Branches**:
require a PR, one approving review, dismissal of stale approvals, required status
checks, and enforcement for administrators; disallow force pushes and deletions.
The existing required check names are `ci`, `Storage and database deployment
boundaries`, and `Notification and sender security`. See the development workflow
for the applied settings and local validation results.

## 2. Allocate genuinely separate staging resources

The owner must select a staging server and authorize any cost before provisioning.
A separate server is preferable because staging load, builds, and tests must not
exhaust production resources. Build images on GitHub runners, not the live server.

In Coolify, create a separate project/environment for staging. Use **Add Resource**
to prepare two **Docker Image** applications and separate database services; UI
labels can differ by installed Coolify version. Record resource identifiers in a
private operator runbook. Do not duplicate an application together with its
production secrets, data mounts, domain assignments, or deployment webhooks.

The staging environment needs:

- A new PostgreSQL **18** service with its own volume, database, owner/migration
  account, and restricted runtime account. This matches the repository's hardened
  runtime role checks and isolated SQL tests. Do not reuse production DB users.
- A new authenticated Redis service with its own persistent volume and private
  network. Never attach the API to production Redis or its existing queues.
- A new persistent upload directory/volume. If S3/MinIO is used, use an isolated
  endpoint/bucket and credentials restricted to that staging bucket. The hardened
  API still requires its declared upload mount even when S3 is enabled.
- Separate application secrets and synthetic test accounts. Use non-deliverable
  test addresses unless a recipient and mail sink have been explicitly approved.
- Network rules preventing staging from reaching production databases, Redis,
  storage, SMTP, payment services, and production webhooks. Permit only the
  reviewed dependencies needed for a particular test.
- An approved staging web origin and API origin with HTTPS and controlled access.
  A provider-generated address may be used if the hosting account supplies one.
  No staging hostname is reserved or configured by this repository change.

Do not change existing production DNS. If new DNS records are needed, the domain
owner must approve the exact new hostname, target and certificate setup. Record
the confirmed URLs before entering them as build variables.

## 3. Prepare the database and hardened API boundary

This step needs an operator with access to the new staging host and database. It
cannot be completed by committing a Compose file or adding GitHub variables.

Read [the rollout safety procedure](../ops/deployment-safety/ROLLOUT.md),
[host preflight](../ops/deployment-safety/HOST_PREFLIGHT.md), and
[rollout operations](../ops/deployment-safety/ROLLOUT_OPERATIONS.md) first. Their
storage, identity and migration restrictions take precedence over older generic
deployment examples in `DEPLOYMENT_GUIDE.md`. Several operations scripts contain
production-specific resource assumptions. Use these as reviewed references; do
not run production rollout, cutover, or role-provisioning scripts against staging
without an operator adapting and checking their exact targets first.

1. Initialize only the new staging database. Review the base schema, the actual
   migration ledger, and **every** pending SQL migration before running anything.
   The normal runner includes historical seeds and data corrections among `.sql`
   files; a fresh database may queue hundreds of them. Do not import production
   dumps, uploads, personal records, or committed real-person datasets as test
   fixtures. Obtain a reviewed schema/bootstrap plan and synthetic fixtures.
2. For an approved migration, use the explicit
   `backend/scripts/deploy-migrate.js` maintenance job with staging-only
   `MIGRATION_DB_*` credentials. Never inject those credentials into the API or a
   PR workflow. Do not use repair, force, seed or schema synchronization to bypass
   a migration failure. Do not run the maintenance job until its exact target and
   pending SQL have been reviewed.
3. Provision the restricted staging runtime account using a reviewed adaptation
   of [runtime-role.sql](../ops/deployment-safety/runtime-role.sql). Grant the
   required business permissions and reporting-view maintenance permissions,
   keeping schema ownership and migration-ledger mutation outside the API. Review
   grants again when migrations add tables. Do not change production role grants.
4. Create the new staging upload path with access for container UID/GID
   `61001:61001`. Capture its actual Linux mount root, device and inode. Do not
   copy production mount identities or recursively change production ownership.
5. Install a root-controlled, non-writable boundary policy on the staging host and
   mount it read-only at `/run/falcon/storage-boundary.json`. It must contain the
   staging database host/port/name/role, reviewed privilege-enforcement choice,
   and the actual staging upload and allowed read-only mounts. Follow
   `backend/scripts/storage-boundary.cjs`; placeholders will correctly fail.
   Enable least-privilege enforcement only after the staging role proves the
   required checks; a temporary false policy is not permission hardening.
6. Use `NODE_ENV=production`, explicitly set `DB_SYNCHRONIZE=false`, and retain the
   image command `node scripts/runtime-start.cjs`. An environment label such as
   `staging` does not replace `NODE_ENV`. Do not bypass a failing boundary by
   changing the command to `node dist/main.js`.
7. Verify the read-only policy bind and upload mount from the actual replacement
   container. Atomic host-file replacement can leave an existing bind attached
   to the previous inode. Confirm identity again after a deployment.

API startup does not execute migrations. It rejects migration credentials,
unexpected mounts and database identities. A failed boundary means the staging
setup needs correction; it is not a reason to weaken the production controls.

## 4. Keep configuration and credentials separate

The following table lists **names only**. Enter values in the appropriate private
hosting or GitHub settings; never paste secret values into source, PRs, logs or
this document. Public browser configuration is not a place for private keys.

| Location | Configuration names | Staging rule |
| --- | --- | --- |
| GitHub repository variable | `STAGING_IMAGES_ENABLED` | Opt-in switch; enable only after staging configuration is ready. |
| GitHub `staging` environment variables | `STAGING_API_URL`, `STAGING_GOOGLE_CLIENT_ID`, `STAGING_SAAS_BASE_DOMAIN`, `STAGING_DEFAULT_TENANT` | Public frontend build inputs; use only confirmed staging details. OAuth client ID is optional if staging Google login is not configured. |
| Coolify frontend runtime | `API_URL`, `NODE_ENV` | Point to the staging API and run the production-mode server. |
| Frontend Docker build inputs | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SAAS_BASE_DOMAIN`, `NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN` | Supplied from the GitHub staging variables above; these are baked into the image. |
| Coolify API runtime: database | `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SYNCHRONIZE` | Match the staging boundary policy and restricted account. |
| Private maintenance job only | `MIGRATION_DB_HOST`, `MIGRATION_DB_PORT`, `MIGRATION_DB_DATABASE`, `MIGRATION_DB_USERNAME`, `MIGRATION_DB_PASSWORD` | Separate staging migration identity; absent from API runtime. |
| Coolify API runtime: authentication/routing | `JWT_SECRET`, `JWT_EXPIRATION`, `FRONTEND_URL`, `SAAS_BASE_DOMAIN`, `DEFAULT_TENANT_SUBDOMAIN`, `DEDICATED_APP_HOSTS`, `AUTH_PROVIDER` | New staging JWT secret. Declare the exact staging web/API hosts as dedicated hosts to avoid tenant-name misinterpretation. |
| Optional staging Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `ALLOWED_DOMAIN`, `ALLOWED_EMAIL_DOMAINS` | Separate approved client and callback; leave production OAuth unchanged. Tenant domain rules also apply. |
| Coolify API runtime: Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`, `REDIS_TLS_SERVERNAME` | Dedicated staging service. TLS settings must match the actual service. |
| Coolify API runtime: uploads | `UPLOAD_PATH`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE` | Only new staging mounts and bucket credentials. Omit S3 configuration when using the reviewed disk path. |
| Email and scheduled notifications | `PORTAL_EMAIL_DELIVERY_ENABLED`, `PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` | Disable delivery/scheduled alerts and omit SMTP credentials initially. |
| Optional notification activation | `PORTAL_NOTIFICATION_QUEUE_PREFIX`, `PORTAL_NOTIFICATION_ACTIVATED_AFTER` | Review separately; use a fresh staging queue prefix/cutoff if activating workers. |
| Payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYU_MERCHANT_SALT`, `PAYU_WEBHOOK_SECRET`, `ALLOW_MOCK_PAYMENTS` | Omit live credentials; keep mock payments disabled. Approve provider test credentials separately. |
| Other integrations | `GEMINI_API_KEY`, `GST_API_BASE_URL`, `GST_API_KEY`, `HELPDESK_PROVIDER`, `HELPDESK_WEBHOOK_URL` | Omit external credentials/endpoints until a test integration is authorized. |
| Module signing and event integrations | `PRODUCT_VERIFICATION_*`, `INVENTORY_*`, `CONSUMABLES_*`, `RETURNS_*`, `ASSET_SERVICE_*`, `ASSET_RETIREMENT_*`, `PHYSICAL_IDENTITY_*`, other module event/signing variables | Inspect the relevant module before enabling; never reuse production signing keys, device enrollment tokens, webhook endpoints, or scanners by assumption. |

Setting `PORTAL_EMAIL_DELIVERY_ENABLED=false` is **not a universal mail kill
switch**: password-reset code independently reads SMTP configuration. Omit SMTP
credentials and control egress. Some institutional notification paths accept only
the approved institutional sender; a mail sink is not automatically compatible
with every email feature. Review and test any sink adapter separately.

Keep public staging in production mode. Payment webhook code can skip signature
checks without a secret in non-production mode. A separate Google OAuth client
must register the staging callback ending in `/auth/google/callback` and the
approved frontend origins. Local synthetic accounts can be used until that is
configured. The Keycloak switch does not provide a working separate identity
provider in the current implementation.

## 5. Enable staging image publication

The new [Publish staging images workflow](../.github/workflows/publish-staging-images.yml)
builds separate images. It contains no Coolify deployment calls and does not
publish to production image names or tags.

1. Merge the reviewed repository setup through the normal PR process. Until the
   workflow exists on GitHub's default branch, its completion trigger and manual
   Actions entry may not be available.
2. In GitHub **Settings → Environments**, create `staging`. Add the four public
   `STAGING_*` build variables listed above under **Environment variables**.
   Keep runtime/database secrets in Coolify, out of this build environment.
3. Allow the trusted workflow branches `main` and `develop` in the environment's
   deployment-branch rules. Use a reviewer if your team wants an additional gate
   before image publication. Manual publication must run the trusted workflow;
   the reviewed feature/fix SHA is an input, not permission to execute arbitrary
   branch workflow changes with staging access.
4. Open **Settings → Secrets and variables → Actions → Variables**. Create the
   repository variable `STAGING_IMAGES_ENABLED` with the value `true` only after
   the above configuration has been verified. Leave it unset or false to keep
   publication disabled.
5. After an approved merge into `develop`, let **Falcon CI** finish successfully.
   The staging publisher validates that revision and builds these images:

   ```text
   ghcr.io/shodh-ai/falcon-staging-backend:sha-<full-SHA>-run-<run-id>-<run-attempt>
   ghcr.io/shodh-ai/falcon-staging-frontend:sha-<full-SHA>-run-<run-id>-<run-attempt>
   ```

6. Confirm both image jobs completed and download the workflow's image-reference
   artifacts, `falcon-staging-backend-<run-id>-<run-attempt>` and
   `falcon-staging-frontend-<run-id>-<run-attempt>`. Use their exact references;
   the run suffix separates
   rebuilds when public configuration changes for the same source SHA. Record
   their digests as well. Confirm GHCR
   package pull permissions. If private, configure Coolify with a narrowly scoped
   read-only registry credential; do not expose a write token to the runtime.

The production-built frontend must not be reused for staging by merely overriding
`API_URL`: upload rewrites and other `NEXT_PUBLIC_*` values are baked at build time.
Rebuild the staging image if its API URL, tenant domain or OAuth client changes.

## 6. Deploy the approved revision to staging

Once provisioning and configuration are complete, an authorized operator can:

1. In each new Coolify **Docker Image** application's image settings, enter the
   staging image name and exact `sha-...-run-...` tag from the successful build (or
   record and pin its digest). Do not select `:production` or a floating tag.
2. Configure the backend's private container port as `4000`, the frontend's as
   `3000`, the approved distinct domains, staging runtime variables, and the
   prepared persistent mounts. Do not publish database/Redis ports to the Internet
   or add fixed host port mappings to the application containers.
3. Retain the images' Node-based health checks, with at least their existing
   45-second start grace. Verify `/health` for the API and `/` for the frontend.
   Do not replace these with a dashboard check requiring `curl`/`wget` unless
   those executables are actually present in the final image.
4. Set bounded CPU/memory, review available server capacity, and keep the previous
   healthy container available during replacement. After the first healthy
   guarded API release, configure the reviewed pre-deployment resource check from
   the rollout guide. Do not skip its headroom requirements on a shared host.
5. Deploy the backend, verify its image revision, health and database/storage
   boundary, then deploy the frontend from the same SHA. Review the actual new
   containers; a healthy public endpoint can still be served by an older one.
6. Sign in with synthetic accounts. Verify tenant/role access, one representative
   read/write workflow, an upload/download, and any enabled jobs. In browser
   developer tools, verify API and upload requests go exclusively to staging.
   Confirm that test actions send no real mail, charge no real payment, and touch
   no production queue/storage/database.
7. Record the tested SHA, image digests, URLs, schema changes, test evidence,
   approver, and any limitations in the release PR. Only then mark staging ready
   for team use.

Coolify supports Docker Image resources with runtime settings and persistent
mounts independently of the build; consult its
[deployment model](https://coolify.io/docs/core/build-deployment-model) and
[health-check guide](https://coolify.io/docs/applications/configuration/health-checks)
for your installed version.

## 7. PR previews: manual and limited until provisioned

There is no automatic per-PR hosting setup in this change. A passing PR check or
published staging image does not create a preview URL.

For a **trusted, reviewed frontend-only PR** from this repository, a maintainer
can open **Actions → Publish staging images → Run workflow**, select `main` or
`develop` for the trusted workflow, and enter the reviewed `feature/*` or `fix/*`
branch as `source_branch` and its full commit SHA as `source_sha` after successful
CI. The SHA must still be the branch head, with a non-draft PR into `develop`, an
approval on that current SHA, no outstanding requested changes, and the latest
matching Falcon CI run successful. Provision a separate
frontend Docker Image resource from that image, record its approved preview URL
in the PR, and remove only that preview resource when it is no longer needed.
Do not overwrite the shared staging frontend for an unmerged PR.

Using the shared staging API means preview users can change shared synthetic data.
Coordinate those tests. The approved preview origin must pass the staging API's
existing CORS policy; use a reviewed staging domain arrangement or explicit
configuration. Do not weaken CORS, share production cookies/JWT secrets, or alter
production authentication to accommodate previews. Google sign-in may require
its own approved origins/callback handling; local synthetic login is sufficient
for previews that do not test Google login.

PRs changing backend behavior, migrations, authentication, queues, or contracts
need their own isolated full environment, following this guide. Do not point a
preview backend at the shared staging database merely for convenience. Fork PRs
receive CI only; maintainers must review them before any credential-bearing or
shared-infrastructure testing. Automated preview provisioning and teardown remain
future work requiring hosting access and an agreed isolation/cost policy.

The current publisher always uses the shared `staging` environment's public build
settings. It therefore does **not** implement full-stack previews with a different
API. Those require a separately reviewed preview-specific build configuration and
pipeline, producing new frontend/backend image manifests for that environment.
Do not reuse the shared-staging frontend image and change only runtime `API_URL`:
its upload rewrites would still reach shared staging. Do not temporarily repoint
the shared staging build variables for a PR. Until that separate build workflow
is implemented, use local isolated full-stack testing for backend PRs.

## 8. Production stays an explicit release decision

Staging acceptance does not deploy production. Approved changes reach `main`
through a reviewed PR, production CI/build validation runs, and the existing
production image workflow publishes a separate candidate. An authorized operator
must then choose and approve the production promotion workflow.

Before promotion, verify the exact SHA is on approved `main`, its required CI and
image build passed, staging evidence applies to that code, and pending database
changes have a separate reviewed plan. The manual production publication path
does not independently prove all of those facts. Production and staging frontend
images differ because of public build configuration; record source identity for
both. If a merge changes code after staging acceptance, test the resulting code
again before release.

Keep production Coolify Git-source auto-deployment disabled once its existing
prebuilt-image conversion is verified. If it is still enabled, an authorized
hosting administrator must schedule that settings change before relying on the
approval gate; this repository change has not inspected or modified that dashboard.
GitHub approval alone cannot block a separate hosting auto-deploy hook.

Follow [PREBUILT_IMAGE_DEPLOYMENT.md](PREBUILT_IMAGE_DEPLOYMENT.md) for authorized
promotion and [ROLLOUT.md](../ops/deployment-safety/ROLLOUT.md) for host/data safety.
When the release owner explicitly authorizes a production deployment:

1. Open the merged release PR and copy its full resulting commit SHA. Confirm the
   commit is in `main` history, and inspect **Actions → Falcon CI** for successful
   checks on that exact main revision. Do not substitute a feature-branch SHA.
2. Inspect **Actions → Publish production images** and verify both candidate
   image jobs succeeded for that SHA. Resolve any failed or pending gates first.
3. Confirm the operator's pending-migration review, live host/storage preflight,
   backups and compatible rollback image, using the established production
   process. Database changes require their own approval; image promotion does
   not authorize them.
4. Open **Actions → Promote production images → Run workflow**, choose the
   `main` workflow, enter the full SHA as `release_sha`, and select `deploy=true`
   only for the authorized deployment with verified Coolify webhooks. Even
   `deploy=false` changes production image tags, so do not dispatch it merely as
   a dry run.
5. Have a different eligible reviewer approve the waiting `production` jobs via
   **Review deployments**. Afterward verify actual running image identity, API
   and frontend health, authenticated login, uploads and a critical finance
   workflow; record the result. A successful HTTP response alone is insufficient.

Rollback chooses a known-good compatible image and configuration. It must preserve
current databases and uploads; never restore an old production database over new
business records as an automatic application rollback. Older images may fail
current protected-runtime checks, so verify the retained rollback candidate in
advance rather than bypassing those checks during an incident.

## Completion record

The repository changes alone do not complete the following items. The owner and
operator should fill these in privately and attach non-secret evidence to the PR:

- [ ] Production environment reviewer, self-review prohibition and branch rule verified.
- [ ] Main/develop branch protections and required checks verified in GitHub.
- [ ] Staging server/cost and distinct HTTPS origins approved.
- [ ] Separate PostgreSQL 18, Redis, uploads and restricted accounts provisioned.
- [ ] Reviewed schema/migration plan and synthetic data ready; no production data copied.
- [ ] Protected boundary policy, UID access, network isolation and runtime settings verified.
- [ ] Staging public build variables configured; image publication explicitly enabled.
- [ ] Both images published and exact revisions manually deployed to separate Coolify resources.
- [ ] Authentication, uploads, role/tenant checks and representative team workflows pass.
- [ ] Preview scope/URLs and any limitations documented; no automatic preview claims.
- [ ] Production auto-deploy state and authorized promotion/rollback procedure confirmed.

Until those checks are complete, describe this as **prepared configuration with
manual provisioning outstanding**, not an operational end-to-end staging system.
