# Access review release gate

Run `node scripts/security/access-surface.cjs --json` from `backend/` to inventory HTTP routes (including controller and method aliases), socket subscriptions, queue processors, cron/interval jobs, event handlers and application lifecycle hooks without loading application code. Read-candidate classification is based on the HTTP verb; it is not a claim that GET handlers are side-effect free. Inspect raw Express/router registrations and dynamically composed routes during review too.

`node scripts/security/access-surface.cjs --enforce` blocks promotion while any operation is unreviewed, unresolved, stale, or lacks policy/test evidence. Existing operations start unreviewed; discovered decorators are evidence to inspect, not automatic approval. This gate intentionally does not claim the entire legacy platform has been audited.

For each inventory ID add a review to `access-reviews.json` with `status: "reviewed"`, the current `fingerprint`, `reviewer`, `authorization` (identity and allowed actions/roles), `scope` (tenant, campus/department and resource ownership rules), `effect` (actual read/write behavior, including GET side effects), and `evidenceTests` (backend-relative test files). Review public webhooks/login paths explicitly, with signature/rate-limit/idempotency controls where applicable; public is not equivalent to unrestricted.

Fingerprints include the controller/worker file, its transitive local imports, shared authentication/scope/interceptor code and the dependency lockfile. Fingerprint drift requires re-review; do not mechanically update it. A review record is a human/agent assertion, not proof of passing tests. The release workflow must run its evidence tests and the real integration suite in addition to this static gate.

No automatic review-record generator is provided. The initial review map is empty so no legacy operation can be silently treated as reviewed. Newly protected sockets, receipt references, LMS deletion and impersonation checks have focused offline tests, but full review still needs the rest of the business operations.

Production restore and irreversible purge have no public API. Do not add deletion grants to the receipt history ledger; the runtime role needs SELECT/INSERT only. Keep owner-authorized recovery tooling separate from ordinary application credentials.

## Staged rollout prerequisites

- Apply the additive `20261019170000_finance_receipt_versions.sql` migration with reviewed migration credentials before deploying receipt/history reads. Otherwise student file ownership lookups correctly fail closed when the ledger is absent.
- Deploy token-aware frontend socket clients before enabling the backend socket checks. The old backend ignores the additional handshake token. An already-open old browser session must refresh to resume its live stream after backend cutover; ordinary REST workflows remain available. Never admit unsigned clients as a compatibility fallback.
- Existing storage mappings and originals remain in place. Files for failed receipt transactions are retained for investigation; do not automatically purge them. Generated versions use the configured UPLOAD_PATH and keep the `/uploads/...` URL shape.
- The scoped material-delete change preserves originals and material visibility rows, but other legacy hard-delete operations still need per-operation review. `deleteModule`/syllabus reset have uniqueness and parent-link semantics to resolve before converting them; do not equate this material fix with platform-wide deletion protection.
