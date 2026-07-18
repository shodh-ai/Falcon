# CI Failure Root Cause — PR #94

**PR:** [#94](https://github.com/shodh-ai/Falcon/pull/94) (`President` → `main`)  
**Workflow:** Falcon CI (`.github/workflows/falcon-tests.yml`)  
**Run:** [29640689465](https://github.com/shodh-ai/Falcon/actions/runs/29640689465)  
**Commit:** `bdd35b1`

---

## First failing step

**No workflow step executed.**

The job failed at **job startup** (before `actions/checkout@v4`). GitHub never assigned a runner.

---

## Official CI error

```
The job was not started because your account is locked due to a billing issue.
```

| Signal | Value |
|--------|-------|
| Job | `ci` |
| Job ID | 88070597599 |
| Duration | ~1 second |
| Steps run | 0 (empty `steps[]`) |
| Runner | `runner_id: 0` (not allocated) |
| Logs | `gh run view --log-failed` → **log not found** (expected when no runner starts) |

---

## Root cause category

**Environment / GitHub account — billing lock**

This is **not** caused by:

- Workflow YAML syntax
- Missing npm dependencies
- Backend/frontend build errors (in this run)
- Test failures (in this run)
- Missing repository secrets
- Wrong working directory
- Node version mismatch
- Package lock mismatch

The **shodh-ai** organization GitHub Actions billing must be restored before any CI job can run.

---

## Secondary finding (local validation)

After investigating, `npm run test:ci` locally surfaced a **TypeScript error** that would fail CI once billing is restored:

```
src/app/(portals)/leadership/issues/page.tsx(29,59): error TS2339: Property 'role_name' does not exist on type 'User'.
```

Fixed in commit on branch `President` by using `primaryRole` / `roles` from `AuthContext` instead of non-existent `role_name`.

---

## Verdict

| Layer | Status |
|-------|--------|
| GitHub Actions (run 29640689465) | **Blocked by org billing** |
| Application code (post-fix) | Ready for CI re-run after billing restore |
