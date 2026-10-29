# Shared staging setup

This is an operator checklist for a separate testing environment for
`shodh-ai/Falcon`. The team workflow is in
[DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md).

## Current status

- `main` remains the production branch. `staging` is the shared integration branch.
- No staging website, hosting resource, domain, database, Redis service or runtime
  credentials have been configured by this repository change.
- The image publisher is an **inactive template** at
  [publish-staging-images.yml](../.github/workflow-templates/publish-staging-images.yml).
  GitHub does not execute workflows from `.github/workflow-templates/`.
- Database initialization is blocked on the review described in
  [STAGING_DATABASE_PLAN.md](STAGING_DATABASE_PLAN.md). No migration or seed is
  automated by this setup.
- Image publishing, deployment and successful application testing are separate
  milestones. Publishing an image does not create or update a website.

This configuration inventory was reviewed against commit
`efd46fb42759841cba6b5a2598dd2c3017cd59c9`, the starting point for `staging`.
`main` can advance independently; this guide does not establish branch parity or
describe the live deployment revision. Review intervening configuration changes
before activating publishing or deploying a later revision.

The source uses Next.js/React for the frontend and NestJS/TypeORM, PostgreSQL and
Redis/BullMQ for the backend. Dockerfiles and deployment guides describe Coolify;
current hosting dashboard configuration has not been inspected. Have the hosting
administrator confirm the provider and available resources before provisioning.

## Resources the hosting administrator must prepare

| Resource | Staging requirement |
| --- | --- |
| Frontend and backend | Separate services, built from the approved staging revision. Keep production services and deployment hooks separate. |
| PostgreSQL | Separate PostgreSQL 18 instance, database, volume, restricted runtime login and independently held maintenance credentials. Use synthetic records. Review the schema/bootstrap plan before starting the application. |
| Redis | Separate authenticated instance and volume. Global BullMQ configuration has no staging-specific database or queue prefix; the notification prefix alone cannot isolate every queue. |
| Uploads | Separate persistent mount at `/app/uploads`, accessible by backend UID/GID `61001:61001`. Do not attach a production upload path. |
| Host boundary policy | Staging-specific, root-controlled file bound read-only at `/run/falcon/storage-boundary.json`, recording the actual staging upload mount and database identities. |
| HTTPS and access | Authorized staging hostname(s), certificates and appropriate team access restrictions. No hostname is assigned by this document. Preserve existing production DNS. |
| Capacity and recovery | Separate resource budgets, health checks, staging backups and retained prior image digests. Build images away from the production host. |
| Network | Prevent staging from reaching production databases, Redis, storage and integration endpoints. Permit external integrations individually after review. |

The backend's existing Docker command is `node scripts/runtime-start.cjs`. Preserve
it. This launcher requires `NODE_ENV=production`, validates the protected storage
policy, checks the actual database identity/permissions and refuses runtime
migration credentials. Do not bypass it to make an incomplete environment start.

The policy must describe the **new staging resources** and use
`enforce_least_privilege=true`; copying the production policy is not sufficient.
Its mount identities include kernel mount root, device and inode metadata. The
application cannot generate this host-owned policy. See
[storage/database protection](../ops/deployment-safety/ROLLOUT.md) for the existing
guard's behavior; its production adoption instructions are not a staging bootstrap
script.

## Configure runtime values in the hosting secret/configuration store

Production mode deliberately ignores image-local dotenv files. Configure the
running services through the hosting dashboard or its approved secret store.
There is no ready-to-run staging environment file: hosts, credentials, tenant
fixtures and host policy must first be confirmed. Never commit actual values.

### Backend

| Variable | Required staging setting |
| --- | --- |
| `NODE_ENV` | `production`. This also keeps development login and unsigned-webhook fallbacks disabled. |
| `PORT` | `4000`, matching the backend Dockerfile and health check. |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Staging PostgreSQL connection and restricted runtime account, matching the protected host policy. Set the actual provisioned port explicitly. |
| `DB_SYNCHRONIZE` | `false`. Schema changes require separate review. |
| `TYPEORM_LOGGING` | `false`. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | The separate staging Redis service and its authentication settings. |
| `REDIS_TLS`, `REDIS_TLS_SERVERNAME` | Match the approved Redis transport and certificate. Do not invent a TLS server name or disable certificate validation. |
| `UPLOAD_PATH` | `/app/uploads`, with the isolated persistent mount and matching policy. |
| `JWT_SECRET` | A newly generated staging secret, different from production. |
| `HR_ENCRYPTION_KEY` | A separate, newly generated staging encryption secret; preserve it with the staging dataset and backups. |
| `AUTH_PROVIDER` | `local` initially. Local login still requires reviewed synthetic tenant/user records. |
| `FRONTEND_URL` | Confirmed staging HTTPS frontend origin, with no trailing slash. Never leave this unset: password-reset code has a production URL fallback. |
| `SAAS_BASE_DOMAIN` | The approved staging hostname suffix, without a scheme or path. Do not reuse the broad production tenant suffix. |
| `DEFAULT_TENANT_SUBDOMAIN` | The synthetic tenant's actual subdomain in the staging database. |
| `DEDICATED_APP_HOSTS` | Comma-separated staging app/API hostnames that should use the default tenant when no tenant selection is supplied. |
| `PORTAL_EMAIL_DELIVERY_ENABLED` | `false` initially. |
| `PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED` | `false` initially. |
| `ALLOW_MOCK_PAYMENTS` | `false`. Public staging keeps production-mode safeguards. |

Do not inject any `MIGRATION_DB_*` variables into the API container. Database pool
settings (`DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE_MS`, `DB_POOL_CONNECT_MS`) must
fit the staging database's capacity; current source defaults are not a capacity
assessment. Leave `PORTAL_NOTIFICATION_ACTIVATED_AFTER` unset while notification
email delivery is disabled. Enabling that delivery later requires a fresh valid
`PORTAL_NOTIFICATION_QUEUE_PREFIX`, explicit UTC activation time and separate review.

### Frontend

| Phase | Variable | Required staging setting |
| --- | --- | --- |
| Build | `NEXT_PUBLIC_API_URL` | Staging backend HTTPS origin, without `/api` or trailing slash. |
| Build | `NEXT_PUBLIC_SAAS_BASE_DOMAIN` | Approved staging hostname suffix, matching backend tenant configuration. |
| Build | `NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN` | The same synthetic default tenant as the backend. |
| Build | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional; omit until a separate staging OAuth client is approved. This identifier is public. |
| Runtime | `API_URL` | The same staging backend origin used for the build. |
| Runtime | `NODE_ENV`, `PORT` | `production` and `3000`, already set by the frontend Dockerfile. |

Build a **separate staging frontend**. Runtime `API_URL` only overrides some
callers: several client pages and the `/uploads` rewrite use the build-time
`NEXT_PUBLIC_API_URL`. Reusing a production frontend image with only a runtime
override can still send requests to production.

The frontend helper reads `NEXT_PUBLIC_DEDICATED_APP_HOSTS`, but its Dockerfile does
not currently declare or forward that argument. Select a hostname layout that
works with the existing build arguments, or review a dedicated change before
relying on that setting. Test explicit tenant selection and the default tenant.
REST CORS and notification WebSocket origin checks are separate; both must accept
the authorized staging frontend without granting production origins access.

## Keep external effects isolated

| Integration | Initial state and later requirement |
| --- | --- |
| Email/password reset | Omit `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` and restrict SMTP egress. Portal email flags do not cover every sender. General portal SMTP enforces the institutional Gmail identity; do not reuse its password. Review a capture transport or test harness before claiming email/reset delivery works. |
| Google OAuth | Omit `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` until a separate approved client, callback, test users and allowed-email-domain policy are available. Test tenant continuity through redirects/cookies. |
| Payments | Omit `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYU_MERCHANT_SALT` and `PAYU_WEBHOOK_SECRET`. Later use approved provider test credentials and distinct signing secrets. Development payment mocks cannot be enabled by weakening the production-mode runtime. |
| Object storage | Omit `S3_ENDPOINT` initially and use isolated disk uploads. If S3 is needed, pre-provision a staging bucket with scoped `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY` and `S3_SECRET_KEY`; startup can attempt bucket creation. Disk upload isolation is still required. |
| AI and lookup services | Omit `GEMINI_API_KEY` and `GST_API_*` initially. Use a separate approved AI budget and synthetic documents when enabled. Google Books/OpenLibrary may make public requests even without `GOOGLE_BOOKS_API_KEY`; control egress. A GST pending-credentials response is not a successful external verification. |
| Business webhooks | Omit module-specific `*_EVENT_WEBHOOK_URL`, `*_EVENT_SIGNING_PRIVATE_KEY` and `IRMS_CALLBACK_SIGNING_PRIVATE_KEY`. Later configure staging-only destinations, keys and `*_EVENT_HOST_ALLOWLIST`/`IRMS_CALLBACK_HOST_ALLOWLIST`. IRMS callback URLs also come from database records. |
| Devices and helpdesk | Keep helpdesk local; external webhook provider support is incomplete. Use separate `HR_BIOMETRIC_WEBHOOK_SECRET` and physical-device enrollment credentials only for synthetic devices; leave production forwarders unchanged. |

Schedulers and outbox workers start with the backend. There is no verified global
"disable all jobs" setting. Synthetic data, empty staging queues and network
isolation are required even with notification delivery disabled. Preserve malware
scan requirements for evidence/uploads and verify the required scanner tools for
the workflows the team will test. Disabled integrations must remain listed as
untested in acceptance results.

## Activate image publishing only after a separate review

The template prepares `ghcr.io/shodh-ai/falcon-staging-backend` and
`ghcr.io/shodh-ai/falcon-staging-frontend`. It does not invoke Coolify, run a
migration, move production tags, or deploy containers.

1. Have an administrator review package access so the staging publisher uses only
   the intended staging packages. Review the workflow and its inline validation.
2. In GitHub **Settings → Environments**, create `staging-build`. Add appropriate
   required reviewers and restrict deployment branches to **Selected branches and
   tags → `main`**. The workflow runs from reviewed `main`; its validated application
   source is `staging`. Confirm these controls are available for the repository.
3. Add the following **environment variables**, not secrets, to `staging-build`:

   | Variable | Value |
   | --- | --- |
   | `STAGING_API_URL` | Confirmed staging API HTTPS origin. |
   | `STAGING_SAAS_BASE_DOMAIN` | Approved staging hostname suffix. |
   | `STAGING_DEFAULT_TENANT` | Synthetic staging tenant subdomain. |
   | `STAGING_GOOGLE_CLIENT_ID` | Optional public staging OAuth client identifier. |

   Do not put hosting tokens, database credentials, JWT keys, SMTP credentials or
   other runtime secrets in this build environment.
4. Use a separately reviewed PR into `main` to move the template into
   `.github/workflows/publish-staging-images.yml`. In that same PR, update
   [.github/tests/staging-workflow.spec.cjs](../.github/tests/staging-workflow.spec.cjs):
   change its template file path to the active workflow path and replace the
   assertion that the active workflow is absent with an activation-appropriate
   assertion. Retain and run its validation, opt-in, trusted-branch and permission
   tests against the active workflow; do not simply remove the test suite.
   This activation is not performed by this setup PR. Do not merge it automatically.
5. Keep the repository variable `STAGING_IMAGES_ENABLED` unset or `false` until the
   environment controls and public configuration are verified. To opt in later,
   use **Settings → Secrets and variables → Actions → Variables** and set it to
   `true` through the approved activation procedure.
6. The publisher accepts only the current `staging` revision with the required
   latest successful exact-revision push run of `Falcon CI`. Follow the activated
   workflow's inputs and approval prompt. Retain its image manifest and digests.
   A passing PR run alone is not evidence of the required post-merge push run.

The template rechecks the source and latest CI after the build-environment
approval wait, before checkout. A branch can still advance while images build;
each build has a unique tag and recorded digest. A future deployment must recheck
the approved candidate and CI before rollout rather than assume the newest
published image is the current candidate.

## First deployment and acceptance remain manual

The senior operator must complete the database plan, provision the resources and
review the exact image pair and configuration before starting staging. Any future
deployment automation should use a separate protected `staging` environment with
senior approval and appropriately scoped hosting access. It is not implemented here.

Configure existing container health checks and verify the protected boundary from
inside the actual staging container. After a healthy guarded image is available,
review `node scripts/resource-boundary.cjs` as the Coolify pre-deployment command;
it is not automatically called by the runtime launcher. Confirm actual host memory,
filesystem capacity and rolling-update requirements before deployment.

Record the deployed frontend/backend digests, source revision and configuration
version. Separate frontend/backend updates are not an atomic release. Verify login,
roles, tenant separation, cookies, uploads/downloads, WebSockets and representative
background jobs with synthetic accounts, and check that no requests reach production.
Record disabled integrations and failures rather than marking them passed.

For a failed staging release, retain the previous healthy image/configuration pair
and investigate. Database compatibility must be reviewed before reverting images;
never restore an older database over current records as an automatic rollback.

Existing production environment reviewer settings are outside this change. Any
production approval-control gap needs separate authorization and review before
changing production settings. No production release is authorized by this guide.
