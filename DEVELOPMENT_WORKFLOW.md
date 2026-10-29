# Falcon development and release workflow

Repository: [shodh-ai/Falcon](https://github.com/shodh-ai/Falcon).

## Current setup and limits

The approved branch model is `feature/*` or `fix/*` → reviewed PR into `staging`
→ shared application testing → reviewed release PR from `staging` into `main`
→ separately authorized production release.

`staging` was created from `main` at
`efd46fb42759841cba6b5a2598dd2c3017cd59c9` on 24 October 2026. Its own protection
was configured to require one teammate's approval, the three existing CI checks, resolved
conversations, and an up-to-date branch. New pushes dismiss stale approvals;
the latest push needs approval from someone else. Force pushes/deletion are
blocked and administrators are included. The configuration is recorded in
[.github/staging-branch-protection.json](.github/staging-branch-protection.json).
Existing `main` and `develop` protection settings were not changed.

On 29 October the current GitHub identity has repository write access but no
administrator access. GitHub still reports `staging` as protected, but its detailed
protection API is unavailable to this identity. An administrator should confirm
the recorded settings under **Settings → Branches → staging** before team adoption.

On 29 October 2026, `main` was at `68ab62516751eaea1f3b0e3b11da7512d19243e1`,
60 commits ahead of that staging starting point. Those application changes are
not included in this workflow PR. Before shared testing begins, a maintainer must
review a `main` → `staging` synchronization PR, retain the staging CI additions,
and review the database/runtime changes together. Do not reset staging or
overwrite either branch to synchronize them.

The CI configuration in this change adds `staging` without removing the existing
`main`, `develop`, or `testing` targets or tests. Until this setup PR is reviewed
and merged, its new configuration remains on the feature branch. A missing,
skipped, or pending check is not a successful result.

**No shared staging website, automatic deployment, or complete staging database
bootstrap is verified.** The publisher in
`.github/workflow-templates/publish-staging-images.yml` is an inactive template,
outside GitHub's executable workflow directory. It cannot publish images in this
location. No database execution or deployment workflow is added by this setup.

[PR #162](https://github.com/shodh-ai/Falcon/pull/162) remains an unmerged draft
for the previous `develop` design; this change reuses selected safeguards without
closing or merging it. Existing branches and the separate `Falcon-testing` fork
are retained. New team work should follow the `staging` process here; do not merge
old setup PRs wholesale to activate staging.

## 1. Create a feature or fix branch

Use a clean clone or check `git status` before switching in an existing clone.
Do not overwrite unrelated local changes.

```sh
git clone git@github.com:shodh-ai/Falcon.git
cd Falcon
git fetch origin
git switch --create feature/my-feature origin/staging
```

For a bug fix, use `git switch --create fix/my-bug origin/staging` instead.
Use a new branch name for each change. Developers do not push changes directly
into `staging` or `main`.

Install the committed dependencies in the clean checkout:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix tests
```

Most CI jobs and both Dockerfiles use Node.js 20. The notification security job
uses Node.js 22.23.3. Match the relevant CI job when reproducing a result.

Prepare disposable local PostgreSQL/Redis and local-only configuration before
starting the application. Use `backend/.env.example` as a list of settings, not
as permission to reuse live credentials or run historical migrations. The
existing development commands, in separate terminals, are:

```sh
npm --prefix backend run start:dev
npm --prefix frontend run dev
```

These start real application processes. They need a reviewed local database
setup. The full shared-staging baseline is still pending; do not work around that
by connecting a local process to production. See
[STAGING_DATABASE_PLAN.md](docs/STAGING_DATABASE_PLAN.md).

## 2. Check changes and push

Use synthetic inputs and no production environment files. Available checks are:

```sh
node --test .github/tests/staging-workflow.spec.cjs
npm --prefix tests run test:unit -- --runInBand
npm --prefix tests run lint
npm --prefix tests run lint:frontend:tests
npm --prefix frontend test
npm --prefix backend run build --ignore-scripts
npm --prefix frontend run build
```

The full `npm --prefix tests run test:ci` command also includes type checking,
integration coverage and browser tests. It needs an isolated test database and
Playwright Chromium, as configured in `.github/workflows/falcon-tests.yml`.
The existing CI migration step targets its disposable PostgreSQL service; it is
not a deployment procedure for shared staging. Integration/reset scripts can
modify their targets. Do not point them at shared staging or production.
Backend `npm run lint` includes `--fix`, so it edits source files.

Review and stage only intended files:

```sh
git diff
git add path/to/changed-file
git commit -m "Describe the change"
git push --set-upstream origin feature/my-feature
```

Replace the example filename and branch name. Never commit secrets, environment
files, database dumps, uploaded documents or real-user fixtures. Example commands
do not imply that checks have passed; report the actual results for your revision.

## 3. Open and review a PR into staging

On GitHub choose **Pull requests → New pull request**, **base: staging**, and
**compare: feature/my-feature** (or your `fix/*` branch). With GitHub CLI:

```sh
gh pr create --repo shodh-ai/Falcon --base staging --head feature/my-feature
```

Describe the affected roles, test evidence and any schema/integration changes.
Request a teammate's review and wait for all three required checks:

- `Storage and database deployment boundaries`
- `Notification and sender security`
- `ci`

If the feature branch falls behind, merge the latest staging branch normally:

```sh
git fetch origin
git merge origin/staging
git push
```

Resolve conflicts, rerun checks and obtain fresh approval. Do not force-push shared
branches or bypass a failing check. Database changes need the additional sequence
and recovery review described in the database plan.

No PR previews are currently configured. Attach local test evidence and explicitly
say that no preview was tested. Future previews must use isolated test services;
a frontend preview sharing staging's backend can change shared synthetic data.

## 4. Verify the integrated staging application

After review and green checks, an authorized teammate merges into `staging`.
CI checks the resulting integration commit again. Until hosting and deployment
activation are approved, this merge does not create a verified testing website.

The operator prerequisites are in [STAGING_SETUP.md](docs/STAGING_SETUP.md).
The intended deployment sequence is:

1. Verify the exact current staging SHA and its successful push CI.
2. Build separate frontend/backend staging images and record their digests.
3. Verify isolated resources and the separately approved database sequence.
4. Run any approved staging-only migration before the new backend serves traffic.
5. Verify runtime grants/storage policy, start the backend, then the frontend.
6. Confirm the new image revisions, health and authenticated application behavior.

Steps 3–6 are not automated by this repository change. Existing backend startup
must remain migration-free. A failed migration or smoke test stops release
progression; production must not be used to diagnose it by trial deployment.

Test the affected roles and tenant boundaries, database writes, login/password
reset, upload/download, WebSockets, queues and approved sandbox integrations.
Record the actual URL, commit, image digests, tester, date and results in the PR
or release record. An HTTP 200 response alone is not complete application testing.
Do not reset staging on every deployment; preserve testers' work and bug evidence.

## 5. Release from staging to main

Freeze the release candidate on `staging` while it is verified and reviewed. A
`staging` → `main` PR contains every integrated change; any further push changes
the candidate and requires renewed verification and approval.

```sh
gh pr create --repo shodh-ai/Falcon --base main --head staging
```

Include the exact tested SHA/digests, integration results, migration review and
recovery limits, release owner and previous known-good images. Obtain the existing
upstream reviews and checks; staging approval does not replace release approval.

Before a `main` merge, the senior operator must confirm the live Coolify triggers.
The inspected GitHub flow publishes production images after successful main push
CI. Publishing does not itself call Coolify. **Promote production images** is
manual, changes production image tags even with `deploy=false`, and optionally
calls deployment webhooks. The actual hosting-side trigger configuration is not
verified here. At the 24 October inspection, the `production` environment had no
reviewer rules; the operator must confirm its current controls.
Any changes to that environment or production release policy need separate approval.

Use the existing [prebuilt-image release procedure](docs/PREBUILT_IMAGE_DEPLOYMENT.md)
only after operator authorization. Do not promote a staging frontend image into
production: its API/tenant settings are built in. Production needs its own build
with production configuration. No production workflow is modified by this change.

## 6. Fix bugs and roll back safely

Create `fix/*` from `origin/staging` and use the same review/CI/test path. If an
urgent production fix is approved outside this path, bring the approved `main`
change back through a reviewed synchronization PR into `staging`; never reset or
force-push staging to discard pending team work.

For an application rollback, use the previous verified image/configuration pair
only after checking database compatibility. Do not assume reverting Git reverses
migrations. There is no automatic database downgrade or staging reset in this
setup. A separately approved restore/reset plan must identify only the isolated
staging resources and preserve the migration record honestly. Production rollback
remains an explicitly authorized operator action.
