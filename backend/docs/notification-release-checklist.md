# Notification staging and release gates

This is a review checklist, not a startup or deployment script. No production
access or execution is authorized by this file. Do not replay historical jobs.

The notification-only staging entry point, capture transport and disabled Compose
profile are prepared in `backend/scripts/notifications/staging/README.md`.
That file lists exact new resources, configuration names, responsible owners and
the execution order. Initial preparation did not execute resources or delivery.
**Separately approved local isolated execution took place on 16 October 2026**,
as recorded below; hosted staging and production remain unverified. The existing
Defaulter acceptance profile is separate and was not reused.

## Evidence already obtained

- One local alert from the real producer was persisted, processed by the fresh
  queue/worker, accepted by SMTP, and confirmed received by the authorized tester
  from `Falcon <noreply.ums@mygyanvihar.com>` on 15 October 2026.
- The existing alert is visible in the authenticated Faculty dashboard and
  Notification Center. The local test button is disabled after that alert exists.
- This proves the local path only. It does not prove production configuration,
  deployment, Redis persistence, provider quotas, or received authentication headers.

## Local isolated execution — 16 October 2026

These are actual local results reported by the approved execution, distinct from
previous mocked checks and from a hosted staging/production deployment:

- Dedicated PostgreSQL/Redis/Mailpit/backend resources and network identities were
  verified; backend probes to external/existing service ports were blocked.
  This records those tested destinations, not a universal firewall guarantee.
- Reviewed roles, base schema, least-privilege runtime grants and four synthetic
  records (one tenant, Faculty role, user and primary mapping) were created only
  in `falcon_notification_staging`. Existing application data was not copied.
- The separate concurrent outbox index passed preflight and postflight; PostgreSQL
  `EXPLAIN` demonstrated its index path. Production-sized performance and a
  production index application are not implied.
- Linux-native Node **22.23.3 bookworm-slim** runtime and locked dependencies built
  successfully; exact artifacts are recorded in `image-inventory.review.json`.
  Restricted backend health verified database, Redis and running worker.
- A private frontend copy passed its webpack production build and is available
  locally on `3110`, with a self-signed test gateway on `3111`. Browser automation
  may accept that test certificate explicitly; this is not trusted public HTTPS,
  an internet-accessible staging URL or hosted CORS/TLS acceptance evidence.
- One synthetic Mailpit capture was independently verified: exactly one message
  from `Falcon <noreply.ums@mygyanvihar.com>` to only
  `notification-staging@example.invalid`, with action URL
  `https://notification-staging.test:3111/notifications`. PostgreSQL has one
  notification and one accepted receipt. Synthetic frontend login and one success
  history record were verified; tenant `notification-staging`, role Faculty and
  active status remain unchanged. The real frontend showed the initially empty inbox
  updating to exactly one alert, persisted read, persisted dismissal and empty
  active inbox afterward. Unauthenticated/wrong-tenant access returned 401 and a
  forged notification ID returned 404. Socket.IO push was not instrumented.
- An actual synthetic PostgreSQL transaction inserted a row, deliberately failed
  and rolled back; the notification count stayed one. Stopping isolated Redis
  returned sanitized health 503. Redis restoration returned healthy backend; a
  duplicate caller refused to create another intent and Mailpit stayed at one.
  Redis AOF was enabled with last-write status OK. The final drain artifact passed
  both outage shutdown tests: immediate Redis restart plus backend SIGTERM exited
  **0 in 7.561 seconds**, and keeping Redis unavailable throughout SIGTERM exited
  **0 in 4.094 seconds**, neither with OOM. Services were restored and health was
  200 afterward. Duplicate one-shot invocation returned `EXISTING_STAGING_INTENT`;
  Mailpit remained exactly one message. These tests had **no active delivery jobs**;
  in-flight SMTP drain/deadline behavior is covered by mocks, not a real send.
- Final read-only state: one total/accepted/read/dismissed notification, zero
  unfinished intents; queue completed 1, failed/waiting/active 0; AOF enabled,
  last write OK. No fresh email/capture was added during restart tests.
- Superseded failure history: the initial post-Redis-restart SIGTERM timed out
  at 20 seconds/exit 137; an intermediate bounded-cache-QUIT artifact still timed
  out at 15 seconds/exit 137 because Bull fetch reconnect prevented graceful
  close. The final artifact corrects worker admission/drain/close ordering and
  passed the two actual retests above. Do not erase those earlier findings.
- Only the dedicated staging backend was upgraded; the pre-drain backend is
  retained stopped and disconnected as
  `falcon-notification-staging-backend-pre-drain-review`. Staging data volumes
  and the original application's processes/data remained intact. No real
  institutional email was sent in this capture test.
- No production access, original-app restart, existing credential/SMTP change,
  commit, push, merge or deployment occurred during this local execution.

## Configuration review (values belong in the hosting secret store)

| Setting | Required review |
| --- | --- |
| `NODE_ENV` | `production` for a representative staging build; never enable the local notification test profile on a public host. |
| `FRONTEND_URL` | Exact approved HTTPS frontend origin, without path, query, credentials or trailing slash. No localhost staging links. |
| `API_URL`, `NEXT_PUBLIC_API_URL` | Intended staging API, independent of production; verify actual browser requests and CORS. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE` | Institutional Gmail transport currently supports `smtp.gmail.com`, port `587` with STARTTLS (`false`), or port `465` with implicit TLS (`true`); TLS is mandatory. Confirm the administrator-approved combination. |
| `EMAIL_USER`, `EMAIL_PASSWORD` | Authorized institutional principal `noreply.ums@mygyanvihar.com` and privately provisioned approved credential. Never print, paste into this file, or copy production credentials to staging. |
| `EMAIL_FROM` | Shared legacy setting remains unchanged; queued portal emails use the explicit Falcon sender. |
| `PORTAL_EMAIL_DELIVERY_ENABLED` | Keep `false` until all staging gates pass and one recipient/test is approved. Exactly `true` enables this queued email path. |
| `PORTAL_NOTIFICATION_QUEUE_PREFIX` | A new environment-specific `falcon-notification-...` namespace, distinct from production, local and legacy `bull`. Identical on every producer/worker of that environment. |
| `PORTAL_NOTIFICATION_ACTIVATED_AFTER` | Reviewed canonical UTC instant, e.g. the format `YYYY-MM-DDTHH:mm:ss.sssZ`; not a literal placeholder or future time. Set once at cutover and preserve it and the namespace on restart. |
| `PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED` | Keep `false`. Library/attendance scans require separate historical-source-backlog and event-idempotency review before enabling. A queue cutoff alone does not exclude old loans converted into new intents. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, optional `REDIS_USERNAME`, `REDIS_TLS`, optional `REDIS_TLS_SERVERNAME` | Normal Bull/cache clients share validated host/port/authentication/TLS selection. TLS verifies certificates with minimum TLS 1.2; explicit ACL usernames require a password. Set TLS explicitly for the approved hosted service; do not disable certificate verification. Dedicated Redis, persistence, backups, `noeviction`, ACL command coverage and actual hosted credentials remain owner/runtime checks. The isolated capture profile uses separate `NOTIFICATION_STAGING_*` inputs. |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SYNCHRONIZE` | Dedicated staging database and role; synchronization disabled. Verify schema and grants without copying real users or records. |
| `JWT_SECRET`, OAuth/CORS settings | Separate staging authentication secrets and approved origins/callbacks; no production sessions. |

Repository inspection confirms these code requirements, not the values currently
loaded by any hosted environment. No hosting configuration was accessed.

## Database index gate

Only a database owner/operator may execute the reviewed file after explicit
staging approval:

`backend/scripts/notifications/outbox-index.review.sql`

1. Independently verify the approved host, port, database, role and public table.
   Keep index-owner privileges separate from application runtime grants; do not
   grant schema ownership or migration rights just to enable notification mail.
2. Inspect existing index names, definitions and `indisvalid`, `indisready`,
   `indislive` using the catalog query in that file. A same-name object is a stop,
   including an invalid index left by a failed concurrent build.
3. Review the catalog/entity columns and exact partial-index predicate. Schedule
   sufficient disk/I/O capacity and monitor the concurrent build.
4. Apply only this file on a dedicated autocommit connection with error-stop
   enabled. Never use `db:migrate`, a transaction wrapper, or `psql -1`.
5. Verify index definition and all validity/readiness flags after completion.
   Review `EXPLAIN` on the actual reconciler query with staging-sized synthetic
   data. Offline string tests are not PostgreSQL execution/performance evidence.
6. On failure, stop for operator review. Do not automatically drop/recreate an
   index or mark an unrelated migration ledger entry as applied.

### Index preflight/postflight procedure and local execution evidence

The two companion review files perform catalog reads and session settings only:

- `backend/scripts/notifications/outbox-index.preflight.review.sql` requires an
  independently approved database name, server-side address/port and owner role.
  This staging procedure is additionally hard-bound to database
  `falcon_notification_staging`, owner `notification_staging_owner`, and isolated
  PostgreSQL `172.30.71.2:5432`. It requires an owner-owned ordinary
  `public.notification_staging_environment` table containing exactly
  `(id=true, environment='falcon-notification-staging', version=1)`.
  Caller-supplied expected values cannot redirect it to an arbitrary deployment.
  It refuses a standby, role switching, a different owner, a partitioned/inherited
  table, unexpected notification column types/nullability, or **any** same-name
  relation in `pg_class`, including an invalid index or a non-index object.
- `backend/scripts/notifications/outbox-index.postflight.review.sql` repeats target
  checks and verifies the owner, ordinary table, B-tree, five non-unique key
  columns, partial predicate and all validity/readiness/liveness flags. It prints
  every key and the predicate for the owner's exact comparison with the reviewed
  SQL. Passing catalog flags alone is not definition or query-plan approval.

Both files use `ON_ERROR_STOP` and an intentional read-only SQL error to fail with
nonzero status on a refused gate. Do not replace this with `\quit 3`: the available
PostgreSQL 16 `psql` client does not support an exit-code argument to `\quit`.
Preparing these files and their offline contract tests executed no SQL. The
separately approved 16 October local operation subsequently executed preflight,
the concurrent index and postflight successfully on the dedicated staging target.

Before execution the staging database owner must approve the exact target, SQL
file checksums, credentials source, capacity/maintenance window and the timeouts.
The server-side address is the independently inventoried `inet_server_addr()`,
which may differ from a client-facing proxy/DNS address. Expected addresses are
compared as PostgreSQL `inet`, so canonical host address and `/32` host notation
are equivalent; this does not permit a different address or subnet. Verify the protected
connection service's hostname/TLS identity as well: matching SQL fields alone do
not prove that an endpoint belongs to staging. Use a dedicated owner connection,
never the application runtime role. Do not grant owner privileges to runtime.
The marker is owner-provisioned, with a boolean primary key constrained to `true`,
the fixed environment string and integer version `1`; runtime gets SELECT only.
That marker/schema/role owner gate passed for the dedicated local target on
16 October; it grants no approval for another database or hosted deployment. The
general index statement is reusable only after a separate review/authorization;
these staging pre/postflight files deliberately refuse every other database.

From `backend/`, the **owner-operated procedure** for an independently approved
new target is below. Do not rerun it on the already indexed local target:

```sh
PGSERVICE="${STAGING_INDEX_SERVICE:?approved staging service required}" \
PGPASSFILE="${STAGING_INDEX_PGPASSFILE:?protected staging password file required}" \
psql -X --set=ON_ERROR_STOP=on \
  --set=expected_database="${STAGING_INDEX_EXPECTED_DATABASE:?required}" \
  --set=expected_server_addr="${STAGING_INDEX_EXPECTED_SERVER_ADDR:?required}" \
  --set=expected_server_port="${STAGING_INDEX_EXPECTED_SERVER_PORT:?required}" \
  --set=expected_owner_role="${STAGING_INDEX_EXPECTED_OWNER_ROLE:?required}" \
  --file=scripts/notifications/outbox-index.preflight.review.sql \
  --command='SET default_transaction_read_only = off' \
  --command="SET lock_timeout = '5s'" \
  --command="SET statement_timeout = '30min'" \
  --file=scripts/notifications/outbox-index.review.sql \
  --command='SET default_transaction_read_only = on' \
  --file=scripts/notifications/outbox-index.postflight.review.sql
```

This keeps identity verification, the single concurrent index statement and
postflight on one connection with autocommit enabled; no `BEGIN`, `psql -1`, general
migration runner or ledger write is involved. The displayed timeout values need
owner review for the actual staging dataset. A timeout/cancellation can leave an
invalid concurrent index: stop and inspect; do not retry, drop or clean it
automatically. After catalog/definition approval, use plain `EXPLAIN` (without
`ANALYZE`) on the actual reconciler query with staging-sized synthetic data and
review join/order/limit behavior. A small fixture table may legitimately use a
sequential scan; offline tests cannot validate PostgreSQL planner performance.

The backend Dockerfile currently runs the general migration runner before normal
startup. Review its entire pending migration set separately; do not deploy all
uncommitted work or silently apply the Defaulter migration with this email change.

## Worker, backlog and shutdown gate

- `NotificationsModule` embeds the email worker/outbox in the normal Nest backend;
  every API replica starts one when explicitly enabled. Do not add an accidental
  second legacy worker or use Vercel request functions for a persistent worker.
- All replicas must use the same database, approved Redis and stable queue
  prefix/cutover. Normal `/health` is liveness. Use `/health/notifications` for
  queued-delivery readiness: validated activation/sender/link config, namespace,
  running/unpaused worker, registered outbox, read-only database probe, Redis PING
  and unpaused queue. Probes are bounded/single-flight and never contact SMTP.
  Docker healthcheck includes readiness only when queued delivery is explicitly
  enabled; a passing probe does not prove recipient delivery or provider quotas.
- Realtime fan-out currently uses each Socket.IO server's local room adapter,
  not a shared cross-replica adapter. Begin with one reviewed backend instance,
  or separately implement/test cross-instance realtime fan-out before scaling
  API replicas. Sharing the Bull queue does not share WebSocket rooms.
- Check Redis persistence/restart recovery, bounded history, oldest pending age,
  active/delayed/failed counts and durable `sending`/`review_required` records.
  The queue limit is one job/second across replicas, not a Workspace daily quota.
  Approve traffic volume and quota monitoring before production activation.
- Grant enough termination time for bounded SMTP operations and graceful Bull
  shutdown. The restricted local process now uses a 45-second Compose stop grace,
  bounded Redis QUIT, outbox drain/queue close and admission-stop/processor-drain
  before forced fetch close; the two actual no-active-job outage retests passed.
  Ambiguous SMTP results must remain for manual review, never automatic resend
  or bulk replay.
- Retain old queue namespaces untouched. Never invoke retry-all, clean, drain,
  obliterate, bulk re-enqueue or a new-cutoff-on-every-restart workaround.
- Scheduled library events currently lack durable source-event deduplication.
  One scheduler avoids concurrent duplicates but not a crash after persistence
  and before its source marker update. Keep the new scheduled-alert guard off
  until that source workflow is separately corrected/reviewed.
- The portal switch is not a global email kill switch: finance receipts,
  onboarding/alumni welcome listeners and the separate scheduler can call SMTP
  directly. Do not start those unrelated producers/workers with historical data
  for this test. Use an explicitly reviewed restricted staging process/profile
  and synthetic data; no existing service or recipient reuse.

## Staging acceptance procedure (each unexecuted step still requires approval)

1. Approve the dedicated notification staging frontend/backend, database, Redis
   and Mailpit resources in the staging README, the synthetic user/tenant, new
   secrets and protected HTTPS origins. The capture transport is prepared and
   bound only by the separate compiled staging entry point; changing normal
   SMTP environment variables cannot select it. This component profile imports
   no storage, scheduler, OAuth or unrelated producer. Full-portal integration
   and any institutional SMTP test remain separate gates.
2. Build the exact reviewed artifact with the lockfile and compatible Node
   runtime. Keep local-only routes/profile and test-alert control unavailable.
   Run the offline CI checks below, review pending migrations, then complete the
   separate index gate. No production connection is permitted.
3. Verify the deployed commit/artifact, actual browser API target, HTTPS/CORS,
   tenant authentication, Redis identity and running worker. Snapshot old queue
   counts and identifiers without reading/logging message bodies or credentials.
4. For one clearly labeled synthetic alert, invoke the real application producer
   through its supported workflow (for example, a synthetic course announcement
   to one enrolled synthetic student), or an approved trusted service caller.
   Do not expose the local-test endpoint publicly or fabricate an HTTP JWT.
5. Verify one scoped inbox record and deterministic queue job, the expected local
   state progression `pending/queued → sending → accepted`, and the configured
   institutional sender. Confirm inbox receipt independently of SMTP acceptance.
   Inspect only redacted `From`, `Sender`, `Return-Path`, SPF/DKIM/DMARC results.
6. Sign in normally with the predefined synthetic account and verify the alert in the Notification Center, unread state,
   approved HTTPS action link, and tenant/user isolation. Test another tenant,
   inactive account and forged notification ID. Check realtime sockets as well:
   validate signed tenant context against current account/link records, separate
   parent-link and user rooms, and reject query-string authentication. Test
   tenant changes, token expiry and the approved browser Origin
   policy on the deployed gateway before a whole-system security claim. These
   browser/network lifecycle checks are not proved by mocked connection tests.
   The gateway now enforces expiry, Origin and periodic account/link eligibility
   checks. The application has no instant JWT revocation registry; do not claim
   that logout alone immediately revokes every already-issued token/socket.
7. On synthetic records only, verify queue outage recovery, two-worker contention,
   restart/SIGTERM recovery, unchanged legacy queues, and no automatic replay of
   `accepted`, `sending` or `review_required`. Test ambiguous SMTP failures with
   mocks/capture only; never repeat real delivery to simulate a failure.
8. Record test evidence and manual QA approval. Production remains blocked until
   that staging result and the independent hosted configuration review pass.

## Offline commands (no application startup)

From the feature worktree `backend/` directory:

```sh
npm test -- --runInBand notifications-staging core/notifications common/email notifications-local auth/password-reset-sender.spec.ts auth/password-reset.security.spec.ts --silent
node --test scripts/notifications/staging/preparation.spec.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
# Direct production compile into a new temporary directory, without deleting or
# overwriting dist used by an existing process/watch:
FALCON_STAGE_BUILD_DIR=$(mktemp -d /private/tmp/falcon-notification-staging-build.XXXXXX)
npm run build --ignore-scripts -- --outDir "$FALCON_STAGE_BUILD_DIR"
```

Run targeted ESLint without `--fix` and `git diff --check` before review. Do not
use the repository-wide `npm run lint` script for this check: it includes `--fix`.
An offline passing build is not proof of hosted Linux/SMTP/network behavior.

### Earlier preparation checks (before local execution)

- The combined command above: **21 suites / 476 tests passed**, all external
  persistence, delivery and queue dependencies mocked. No real email repeated.
- Node staging configuration/ingress contracts: **8/8 passed**. Both CJS files
  passed syntax checks. Compose YAML and fixed loopback/internal network settings
  passed static inspection; this is not runtime isolation evidence.
- Backend TypeScript no-emit: passed.
- Backend production TypeScript build with lifecycle scripts disabled and output
  directed to a new `/private/tmp/falcon-notification-staging-build.*` directory:
  passed; the compiled restricted staging entry point exists. Existing `dist`
  was not overwritten. This host build does not verify the Linux image.
- Targeted ESLint on this review's notification/staging implementation/tests and
  `main.ts`: passed. Minimal CORS callback types and explicit `void bootstrap()`
  resolved the previous `main.ts` findings without changing runtime policy.
  This is not a repository-wide lint result.
- The offline resource-plan check correctly returns **BLOCKED** for absent
  approved image digests, new private files and HTTPS origin. That is a closed
  execution gate, not a passing resource-provisioning result.
- CI includes the three new staging suites and Node ingress/config checks.
- Workflow YAML, all 20 explicitly listed offline spec paths, and `git diff --check`:
  passed.
- Existing ts-jest TS151002 warnings from focused runs remain a tooling warning.
- During that earlier preparation, no deployed/staging tests, database/index
  execution or Linux image build ran. The separately approved 16 October local
  results above supersede that execution status; hosted verification did not run.

### Current verification checkpoint — 16 October 2026

- **26 suites / 600 focused Jest tests passed** using
  `npm test -- --runInBand notifications-staging core/notifications core/redis common/email notifications-local auth/password-reset-sender.spec.ts auth/password-reset.security.spec.ts --silent`;
  external persistence/SMTP dependencies in those suites were mocked. This is
  separate from actual local PostgreSQL health and index execution.
- **28/28 Node tests passed:** 14 schema-policy, 8 preparation/ingress and
  6 healthcheck tests.
- Backend TypeScript no-emit passed. Linux backend image and private-copy frontend
  webpack production build passed. Existing ts-jest TS151002 tooling warnings
  remain; these are not delivery or production-readiness evidence.
- Actual local roles/base/grants/fixtures, outbox index and dependency health
  passed as listed above. One synthetic Mailpit capture and frontend login passed;
  browser read/dismiss, authorization negatives, synthetic transaction rollback and
  Redis-down health 503 passed. Redis restoration, duplicate-call refusal, capture
  count preservation and both outage shutdown retests passed on the final image.
  The earlier exit-137 failures are retained above as superseded history. Active
  SMTP shutdown behavior remains mock-only. No hosted configuration or production
  validation occurred.
- Final Linux application image:
  `sha256:fbe292de1d4e592d624cceb791c78516c9afd2867991e7febba5996f71ede73e`
  (local tag suffix `20261016-drain`), built with the recorded Node 22.23.3 digest.
  Latest TypeScript, targeted ESLint and Linux build passed.

### Offline hosted-configuration preflight

A hosting/configuration owner may run the pure checker in an approved secret-store
context, without printing/dumping environment values or loading either `.env`:

```sh
node scripts/notifications/release-config.cjs \
  --offline-compiled-dir "$FALCON_STAGE_BUILD_DIR"
```

The path must be the absolute reviewed backend build output. The checker imports
only pure configuration functions, performs no SMTP/Redis/database connection,
and returns names/categories for missing or invalid settings. It checks production
mode, HTTPS action origin, institutional SMTP selection, explicit Redis settings,
DB synchronization disabled, a stable fresh namespace/cutoff, scheduled scans off
and JWT-secret presence/length. It never outputs credentials. Its result always
keeps runtime/credential/staging/production verification false: **configuration
syntax is not live configuration, credential validity or deployment acceptance**.
Normal hosted settings require owner verification separately from the isolated
capture profile and its synthetic-only `NOTIFICATION_STAGING_*` inputs.

## Rollback boundary

Disable queued delivery and stop only the approved staging worker processes;
preserve Redis namespaces, cutoff and durable receipts for review. This portal
flag does not disable the other direct SMTP producers. Roll back only the
reviewed application artifact. The additive index may remain; any later removal
requires a separately approved database operation. Never reset user data,
truncate notification history, replay accepted mail, or modify production as a
staging rollback.
