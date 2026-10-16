# Notification-only staging preparation

**Local isolated execution approved and partly verified on 16 October 2026.**
The initial preparation itself created nothing; later explicit approval allowed
new notification-only local resources, schema/grants, synthetic fixtures and Linux
build. Hosted staging/production have not been deployed or verified. Existing
production/local/Defaulter resources and both checkouts' `.env` files stay intact.

## What is implemented

- `src/notifications-staging/` is a separate compiled entry point. It reuses the
  real authentication, dispatch, inbox, outbox, delivery processor and gateway.
  It imports no `AppModule`, scheduler, OAuth module, storage, AI consumer,
  payment integration or unrelated direct-mail listener.
- It requires explicit CLI/profile/capture guards, Linux container context,
  fixed DNS/IP identity, restricted database role, positive owner marker, and
  the canonical synthetic Faculty account before provider startup. No `.env`
  fallback, synchronization, migration or automatic schema creation occurs.
- SMTP capture is bound only in that module. Normal startup still uses the
  institutional Gmail transport; staging variables alone cannot replace it.
  Capture uses only `172.30.71.4:1025`, checks DNS and the connected destination,
  and permits only `notification-staging@example.invalid` with the final header
  `Falcon <noreply.ums@mygyanvihar.com>`. There are no real SMTP credentials here.
- The one-shot operator path is a separate explicit CLI invocation. It uses
  the real producer with a transaction-scoped advisory lock and durable duplicate check.
  It does not run at startup or expose a send/test/reset HTTP endpoint. Its
  created result is deliberately **not** a delivery-verification result.
- The profile supports sign-in and Notification Center only, not the complete
  Faculty application. Other dashboard APIs are intentionally unavailable.

## Dedicated resources (local instances verified; hosted equivalents unapproved)

| Component | Dedicated identity | Exposure |
| --- | --- | --- |
| PostgreSQL 16 | `falcon-notification-staging-postgres`, `172.30.71.2:5432`, database `falcon_notification_staging` | Internal only; new `falcon-notification-staging-pg16` volume |
| Redis | `falcon-notification-staging-redis`, `172.30.71.3:6379` | Internal only; new AOF volume, authentication, `noeviction` |
| Mailpit | `falcon-notification-staging-mail`, `172.30.71.4:1025`; UI/API `8025` | Internal only, new capture volume, no relay/forwarding/webhooks |
| Backend | `falcon-notification-staging-backend`, `172.30.71.5:4110` | Container-internal only; no published backend port |
| Restricted ingress | `172.30.71.6` internally | Only host `127.0.0.1:4111`; fixed backend target, minimal HTTP/Socket.IO allowlist |
| Frontend and HTTPS proxy | Private local frontend copy `3110`, self-signed test gateway `3111`; hosted origins/access policy still require owner input | Local certificate accepted only for test automation; not trusted public HTTPS or a public staging URL |

`compose.review.yml` has no default service profile and never pulls images.
Every resource requires `reviewed-notification-staging` to be selected explicitly.
The internal network is new `falcon-notification-staging-isolated`, subnet
`172.30.71.0/24`, with Docker bridge gateway mode `isolated`. This is intentional:
an ordinary internal bridge may still reach host services. Host owner must verify
engine support, free subnet/port/names, actual mounts and membership before any
new startup. The approved local resource identities and backend blocked-target
probes were verified on 16 October; do not generalize them to another host. Do not remove/recreate an existing resource on a name collision.

The ingress alone also joins a new ingress bridge. Its application proxy has a
fixed target and rejects CONNECT, arbitrary upstreams, recovery/upload routes,
encoded traversal, query-string authentication and unapproved WebSocket paths.
It is not an OS firewall if the proxy itself is compromised. Runtime egress probes
remain mandatory from backend/Redis/Mailpit/PostgreSQL: prove external SMTP and
host/existing application targets inaccessible. No network isolation is claimed
from a YAML flag or mocked test alone. Actual 16 October backend probes verified
blocked external/existing-service destinations for this local instance only.

## Owner inputs and approvals, without secret values

| Owner | Exact input/decision needed |
| --- | --- |
| Hosting/build owner | Approve new resource allocation, free `172.30.71.0/24` and `4111`, compatible Docker Engine (at least 28 for localhost publication safeguards), and exact digest-pinned Linux images. Inspect image entrypoints, ENV, architecture and Mailpit options; no hidden SMTP relay or webhook. |
| Hosting/build owner | Approve a Node **22 >=22.13 bookworm-slim** image by digest and a later isolated Linux build from `backend/package-lock.json` using `Dockerfile.review`. Host Node is 24.14.0; host/macOS dependencies are not a Linux artifact. App image may be a verified local content-addressed image ID. The approved local Node 22.23.3 image was acquired and the Linux-native app built on 16 October; exact digests/image ID are recorded in `image-inventory.review.json`. Hosted architecture/artifact approval remains separate. |
| Network/domain owner | Approve new HTTPS frontend and API origins, TLS, reverse proxy to loopback `4111`, WebSocket upgrades, and tester authentication/access control. Do not alter production DNS/domains. `noindex` is not access control. |
| Database owner | Review `schema-contract.review.json` against real entities and auth queries; prepare only this dedicated schema, roles and synthetic fixture. No historical migration sweep, schema sync, real records, acceptance-schema reuse, reset tokens or unrelated task tables. |
| Database owner | New owner `notification_staging_owner` owns only staging objects, with no superuser/createdb/createrole/replication/bypassrls/memberships. Runtime `notification_staging_app` owns nothing, has no DDL or elevated/inherited privileges, and only reviewed table/column grants. Marker is owner-owned and runtime SELECT only. Initial image bootstrap principal is not either of these roles. |
| Database owner | Verify actual effective table/column privileges, PUBLIC grants, TEMP privilege, executable security-definer functions and inherited capabilities in PostgreSQL. Startup preflight checks identity/elevated role attributes/memberships/ownership/CREATE; it does not prove the entire effective privilege policy. Actual catalog/grant checks passed on the dedicated local database on 16 October; hosted policy remains unverified. |
| Database owner + reviewer | Approve marker/base schema and one synthetic active Faculty fixture, with tenant `notification-staging`, canonical email `notification-staging@example.invalid`, completed onboarding/active account, and privately chosen bcrypt password. Existing AuthService login writes login history, timestamp/account status and workspace-role mapping; these require reviewed staging grants. No password enters Git/chat. |
| Database owner | Approve the separate concurrent index procedure in `backend/docs/notification-release-checklist.md`. Pre/postflight are hard-bound to this staging target/owner/marker. Application role never gets index-owner rights. |
| Secret/config owner | Privately create NEW runtime config, PostgreSQL bootstrap secret, Redis ACL/password and staging JWT secret. No copy of existing credentials or `.env`. The isolated profile currently authenticates its dedicated default Redis user. Normal Bull/cache wiring now also supports explicit `REDIS_USERNAME` and certificate-verified `REDIS_TLS`/`REDIS_TLS_SERVERNAME`; actual hosted ACL command/TLS compatibility requires verification. |
| QA/operator | Approve capture-only execution and one clearly labeled synthetic notification. Real institutional delivery is a different gate; it remains disabled in this profile. |

All images must be explicit digests (app may use an exact image ID). The input
names are `NOTIFICATION_STAGING_{POSTGRES,REDIS,MAILPIT,APP,NODE}_IMAGE`,
`NOTIFICATION_STAGING_RUNTIME_CONFIG_FILE`,
`NOTIFICATION_STAGING_POSTGRES_PASSWORD_FILE`,
`NOTIFICATION_STAGING_REDIS_ACL_FILE`, and
`NOTIFICATION_STAGING_FRONTEND_URL`. `review-plan.cjs --offline` validates only
their format and refuses shared `.env`/original-checkout file paths. It never
loads those files or contacts any service, and never reports runtime verification.

`runtime.config.example` is the complete safe runtime variable template, with
blank required secrets/origin/namespace/cutoff. The queue prefix must be a new
`falcon-notification-staging-...` value. The canonical UTC activation cutoff is
owner-chosen once and preserved on restart. Do not invent/rotate a cutoff to
make old jobs eligible. Normal `DB_*`, `EMAIL_*`, `SMTP_*`, `REDIS_*`, `JWT_*`,
`PORTAL_*`, production/OAuth/storage configuration is rejected by the profile.

Frontend process/build inputs are `NODE_ENV=production`, approved `API_URL` and
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN=notification-staging`,
and `NEXT_PUBLIC_DEDICATED_APP_HOSTS=<approved-staging-frontend-host>`.
Leave `NEXT_PUBLIC_FALCON_LOCAL_NOTIFICATIONS` unset. Use a separate build/output
and process; do not reconfigure/restart the existing frontend. The only branding
lookup allowed is `/api/tenants/resolve/notification-staging`.

## Execution order — do not rerun completed one-time provisioning

1. Owner signs off resource/image/network/config inventory and this diff. If any
   name, volume, port or subnet exists/conflicts, stop; do not reset or repurpose it.
2. After explicit provisioning approval, create only the named new resources;
   confirm exact images, mounts, labels, isolated network, addresses and no
   published data/admin services. Independently prove blocked egress and host
   service access; configuration strings are not evidence.
3. DBA separately creates/reviews the minimum schema, marker, roles/grants and
   synthetic fixture. A matching name alone is not ownership/schema proof.
   Execute only the owner-approved index procedure after its preflight, then
   inspect exact definition/flags and plain `EXPLAIN` on synthetic staging data.
4. Build the isolated Linux artifact only after build/network approval; never
   mount or replace the approved Mac dependency symlink. Inspect compiled entry
   point and runtime image. No normal `db:migrate` command is used.
5. After startup approval, launch only the restricted staging entry point:
   `node dist/notifications-staging/main.js --approved-notification-staging`.
   Verify health, actual database/role/marker, Redis, worker, ingress, TLS/CORS,
   browser API destination and synthetic sign-in. HTTP password reset, OAuth,
   local-test send route and unrelated APIs must remain unavailable.
6. Only after one-capture approval, invoke the separately guarded compiled entry
   point with `--approved-notification-staging --capture-once` inside the same
   reviewed resource environment. It creates at most one durable test intent
   per namespace/cutoff; it never asserts capture just because enqueue succeeded.
7. Verify exactly one scoped record/job and actual Mailpit capture with final
   sender, sole synthetic recipient and approved HTTPS action URL. Verify the
   authenticated Notification Center, unread/read/dismiss behavior, wrong tenant,
   inactive user, expired JWT and forged IDs. Do not display JWTs/passwords.
8. Verify Redis outage/restart recovery, worker shutdown drain and no replay of
   accepted/ambiguous/legacy deliveries. Keep API replicas at one until a shared
   realtime adapter is implemented/tested. Use mocks/capture for failure tests;
   do not send a second real email.
9. Record staging evidence/manual QA approval. A restricted component acceptance
   is not full normal-application integration or production approval. Review
   that separate promotion and hosted configuration without touching production.

Rollback preserves staging data/receipts/namespace/cutoff for review. Do not use
`down -v`, prune, reset, replay, import production records, or delete captures.
Stopping/removing future resources requires its own explicit authorization.

## Verified local checkpoint — 16 October 2026

- Dedicated resources/networks/volumes were created under the separate local
  approval; no existing resources or records were reused. Backend probes to
  external/existing-service ports were blocked.
- Owner administration, base, least-privilege grants and four synthetic records
  passed on `falcon_notification_staging`. Concurrent outbox index preflight,
  build and postflight passed; PostgreSQL `EXPLAIN` showed the index path.
- Linux Node 22.23.3, locked Linux dependencies and reviewed backend app image
  built successfully. Actual health verified database, Redis and running worker.
- A separate private-copy frontend webpack production build passed; local
  frontend `3110`/self-signed test gateway `3111` are not a public TLS deployment.
- Offline checks passed: **26 suites / 600 focused Jest tests**, **14 schema**, **8 staging
  preparation/ingress**, **6 healthcheck Node tests**, and backend TypeScript.
- Actual Mailpit API independently verified **one captured message**, exact Falcon
  sender, sole synthetic recipient and
  `https://notification-staging.test:3111/notifications` action URL. PostgreSQL
  has one notification/accepted receipt; normal synthetic frontend login and one
  success history entry passed, with unchanged tenant/Faculty/active status.
  Real browser acceptance passed: empty inbox → one alert → persisted read →
  persisted dismissal/empty inbox; unauthenticated and wrong-tenant access returned
  401, forged ID 404. Socket.IO push was not instrumented. Actual PostgreSQL failure
  rolled back a synthetic insert without changing the count. Redis-down health
  returned sanitized 503. Redis restoration/health, AOF last-write status, duplicate
  caller refusal and unchanged one-message capture count passed. Final drain-image
  outage tests passed: Redis restart + SIGTERM exited **0 in 7.561 seconds**; Redis
  kept unavailable + SIGTERM exited **0 in 4.094 seconds**, neither OOM. Restored
  backend health passed. There were no active delivery jobs during those tests;
  in-flight SMTP shutdown remains mock-only.
- Final state: notification total/accepted/read/dismissed 1, unfinished 0; queue
  completed 1 and failed/waiting/active 0; AOF enabled/last write OK; Mailpit count
  remained 1. No real institutional email or extra capture was sent.
- Earlier 20-second and intermediate 15-second shutdown timeouts/exit 137 were
  superseded by bounded cache QUIT, outbox drain/close and worker admission-stop,
  tracked drain then forced fetch close. Compose stop grace is 45 seconds. The
  final image is
  `sha256:fbe292de1d4e592d624cceb791c78516c9afd2867991e7febba5996f71ede73e`
  (local tag suffix `20261016-drain`); original application and data volumes were
  untouched. The pre-drain staging backend is retained stopped/disconnected as
  `falcon-notification-staging-backend-pre-drain-review`.
- This restricted component runtime excludes the full Faculty/Student portal,
  real institutional SMTP and unrelated services. Production remains blocked.

## Safe offline commands

From `backend/` (no application or service startup):

```sh
node --test scripts/notifications/staging/preparation.spec.cjs
node --check scripts/notifications/staging/ingress.cjs
node --check scripts/notifications/staging/review-plan.cjs
npm test -- --runInBand notifications-staging core/notifications common/email --silent
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

No `docker compose up`, SQL runner or delivery caller appears in the offline
commands. Future Compose invocations must explicitly use `--env-file /dev/null`
and new private files; never use implicit project `.env` discovery.

Primary references for the reviewed configuration assumptions:
[Docker bridge gateway isolation and localhost publishing](https://docs.docker.com/engine/network/port-publishing/),
[Mailpit runtime, recipient restriction and relay options](https://mailpit.axllent.org/docs/configuration/runtime-options/).
The approved pinned local Linux backend image built and started successfully on
16 October. Hosted architecture/runtime compatibility remains a separate gate.
