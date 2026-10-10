# FALCON Pharma Context and Current State

This document is the handoff context for FALCON Pharma work. It records the architecture, work completed, QA position, deployment state, and the safe next steps. It does not contain passwords, tokens, private keys, or production secrets.

## Product scope

FALCON is the shared SGVU Campus OS. Pharmacy is a department/cohort inside the same tenant-aware platform; it is not a separate application or database. Pharmacy workflows use the common authentication, tenant/campus/department scope, audit, file storage, notifications, DoFA, module-control, idempotency, and transactional-outbox services.

The finance/DoFA lifecycle is implemented as independent business modules. A module can be enabled for a tenant, campus, department, or pilot cohort without disabling the platform services or breaking historical records.

## DoFA module map

1. **Module 1 — Acquisition:** request, draft, validation, versioning, funding, vendor recommendation, and approval submission.
2. **Module 2 — Procurement/P2P:** purchase orders, receipt/GRN, invoice entry, payment and procurement projections.
3. **Module 3 — Invoice integrity:** investigation, clearance, integrity findings, and payment eligibility.
4. **Module 4 — Physical verification:** verification of received products and physical-subject identity.
5. **Module 5 — Universal inventory:** ProductModel, procurement batch, ITEM/LOT identity, Asset/Lot IDs, RFID identity, custody, location, condition, and authoritative movement ledger.
6. **Module 6 — Consumables:** requests, approval-time LOT reservations, FEFO/FIFO issue, custody consumption, returns, counts, alerts, and replenishment suggestions.
7. **Module 7 — Returns/DOA:** exact ITEM/LOT return allocation, return holds, evidence, eligibility, vendor/RMA/shipment, replacement lineage, and Module 2 execution projection.
8. **Module 8 — Asset service:** service cases, warranty/AMC, preventive maintenance, service custody, parts integration, re-verification, acceptance, and Module 9 referrals.
9. **Module 9 — Retirement/disposal:** retirement holds, assessments, ASSET_WRITEOFF approval, sanitization, disposition, physical/Finance reconciliation, and signed lifecycle certificates.
10. **Module X — Physical identity infrastructure:** signed one-time Module 5 provisioning jobs, RFID/QR/Code128 encoding, independent attachment verification, retrofit, and gate observation. Module X never creates identities or decides inventory status.

Authority boundaries are preserved: Finance/GL owns accounting facts; Module 5 owns inventory truth; Module 6 owns consumables operations; Module 7 owns returns; Module 8 owns service; Module 9 owns retirement/disposal; Module X only executes hardware provisioning and observes gates.

## Pharmacy work completed

- Pharmacy LMS migration is fail-closed and reconciliation-first. Official source files are staged and privacy-minimized before any import.
- Pharmacy course/faculty/student seed pipelines and migration documentation exist under `backend/data/departments/pharmacy/`, `scripts/pharmacy-migration/`, and the Pharmacy migration docs.
- Semester-I Pharmacy student credentials were provisioned by migration commit `ae9d624`.
- Pharmacy launch acceptance requires tenant and department isolation, course/faculty/enrollment/calendar checks, and a readiness result before pilot activation.
- Pharmacy production login and no-load audit scripts exist in `tmp/` for QA use; generated reports and credentials must remain outside Git.

## QA and regression position

The repository includes the GVMC intern QA guide, DoFA Modules 1–9 test plans, independent module-launch plan, and Pharmacy LMS acceptance/migration runbooks. The regression model covers:

- maker-checker and persona separation;
- tenant, campus, department, location, provider, asset, financial, and cohort scope;
- idempotency, stale revisions, event duplicates/gaps/out-of-order delivery;
- exact ITEM/LOT conservation and immutable histories;
- module OFF/SHADOW/PILOT/ACTIVE/DRAINING/PAUSED behavior;
- deferred cross-module handoffs when a dependency is unavailable;
- legacy projection write protection;
- complete acquisition → procurement → invoice → verification → inventory → service/return/disposal flow.

Known QA findings should be tracked against the existing reports rather than fixed with ad-hoc production data. In particular, finance/procurement vendor lookup, invoice-integrity route context, cleared-invoice payment selection, GRN package context, and HOD/DoFA capability seeding have previously required regression attention.

## Current source and production state

- Repository: `https://github.com/shodh-ai/Falcon`
- Local checkout: `/Users/apple/Desktop/Falcon`
- Branch: `main`
- Current source commit: `ae9d624f3d33a4bd65fa06a5f95c24045efd966e`
- Commit: `Provision Pharmacy Semester-I student credentials`
- `origin/main` matches the local commit.
- Frontend and backend production images were built from this exact SHA, published to GHCR, promoted to the `production` tags, and deployed through Coolify.
- Frontend production URL: `https://falcon.jataka.io/`
- Backend health URL: `https://apifalcon.jataka.io/health`
- Latest observed health: frontend HTTP 200; backend `{"status":"ok"}`.

## Deployment incident and permanent operational note

The deployment host was resolving `pkg-containers.githubusercontent.com` to the wrong GitHub web IP (`140.82.112.4`). GHCR manifests were visible, but image config blobs returned 404, causing Coolify deployments to roll back. The deployment host mapping was corrected to a valid GitHub container CDN address, after which GHCR pulls and Coolify rolling updates completed successfully.

The server team should replace the temporary host mapping with a durable DNS resolver configuration and monitor GHCR blob pulls. Do not remove the correction until DNS resolution is verified from the deployment host and both production images have been pulled successfully.

## Safe operating rules

- Build and test locally before promoting an image.
- Publish immutable SHA tags; promote only the tested SHA.
- Deploy backend and frontend through Coolify rolling updates and wait for health checks.
- Never commit generated `output/`, `tmp/`, test reports, credentials, tokens, or production secrets.
- Never put QA passwords or signing keys in this context file or Git.
- Keep module feature flags and rollout scope explicit; do not enable a new Pharmacy cohort by changing global defaults.
- Treat production QA accounts as temporary, rotate them after testing, and store their credentials only in the approved secret store.
- If a dependent module is disabled, commit the source fact and queue an idempotent handoff; do not fabricate downstream completion.

## Next recommended actions

1. Run the Pharmacy launch-acceptance checklist against the intended tenant/department scope.
2. Run the full Modules 1–9 + X regression suite with fresh, non-production QA credentials.
3. Verify GHCR/DNS monitoring on the Coolify deployment host.
4. Review outstanding finance/procurement and DoFA QA findings before expanding the Pharmacy pilot.
5. Keep this document updated whenever a Pharmacy migration, release, rollout, or production incident changes the baseline.
